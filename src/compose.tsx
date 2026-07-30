import {useEffect, useState} from "react";
import {
    BaseError,
    ContractFunctionRevertedError,
    RawContractError,
    decodeEventLog,
    encodeAbiParameters,
    parseAbi,
    type Address,
    type Hex,
    type WalletClient,
} from "viem";
import {messageFromRevert} from "@poi/core";
import {publicClient} from "./chain";
import {EAS_ADDRESS, SCHEMAS} from "./config";
import {
    alignWindow,
    buildDecisionFields,
    DECISION_PARAMETERS,
    decisionText,
    newSalts,
    PRESETS,
    validateWindow,
    type ComposeInput,
    type Window,
} from "./composeDecision";
import {formatUtcMinute} from "./presentation";
import {routeToHash} from "./router";
import {shortHex} from "./card";

const ZERO_UID = `0x${"0".repeat(64)}` as Hex;

const EAS_ABI = parseAbi([
    "function attest((bytes32 schema,(address recipient,uint64 expirationTime,bool revocable,bytes32 refUID,bytes data,uint256 value) data) request) payable returns (bytes32)",
    "event Attested(address indexed recipient,address indexed attester,bytes32 uid,bytes32 indexed schema)",
]);

export interface ComposeSession {
    address: Address;
    client: WalletClient;
}

type Phase = "form" | "publishing" | "done";

/** 온체인에 없는 값이니 실패해도 발행을 막지 않는다 — 표시용 참고치일 뿐이다. */
function useCurrentPriceKrw(): string | undefined {
    const [price, setPrice] = useState<string>();
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const response = await fetch("https://api.upbit.com/v1/ticker?markets=KRW-BTC");
                if (!response.ok) return;
                const rows = await response.json() as Array<{trade_price?: number}>;
                const value = rows[0]?.trade_price;
                if (!cancelled && typeof value === "number") {
                    setPrice(Math.round(value).toLocaleString("ko-KR"));
                }
            } catch {
                // 표시용 시세일 뿐이다.
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);
    return price;
}

function parseThreshold(text: string): bigint | undefined {
    const digits = text.replace(/[^0-9]/g, "");
    if (!digits) return undefined;
    const value = BigInt(digits);
    return value > 0n ? value : undefined;
}

function downloadReasonReveal(uid: Hex, salt: Hex, payload: string): void {
    const file = {version: "poi.reveal.v1", salt, payload};
    const blob = new Blob([JSON.stringify(file, null, 4)], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${uid.toLowerCase()}.REASON.json`;
    anchor.click();
    URL.revokeObjectURL(url);
}

/** viem이 오류를 감싸는 위치가 제각각이라 revert selector를 꺼내는 경로를 하나로 모은다. */
function revertData(error: unknown): Hex | undefined {
    if (!(error instanceof BaseError)) return undefined;
    const reverted = error.walk((candidate) => candidate instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) return reverted.raw;
    const raw = error.walk((candidate) => candidate instanceof RawContractError);
    if (!(raw instanceof RawContractError)) return undefined;
    return typeof raw.data === "string" ? raw.data : raw.data?.data;
}

function publishErrorMessage(error: unknown): string {
    const data = revertData(error);
    if (data) return messageFromRevert(data) ?? `온체인 리졸버가 거부했습니다: ${data}`;
    return error instanceof Error ? error.message : "발행에 실패했습니다.";
}

export function Compose({session}: {session?: ComposeSession}) {
    const currentPrice = useCurrentPriceKrw();
    const [op, setOp] = useState<0 | 2>(0);
    const [thresholdText, setThresholdText] = useState("");
    const [presetIndex, setPresetIndex] = useState(0);
    const [reason, setReason] = useState("");
    const [phase, setPhase] = useState<Phase>("form");
    const [notice, setNotice] = useState<string>();
    const [errorMsg, setErrorMsg] = useState<string>();
    const [publishedUid, setPublishedUid] = useState<Hex>();

    if (!session) {
        return <main id="main-content" className="page-shell narrow-page">
            <p className="compose-connect-notice">판단을 발행하려면 지갑을 연결해 주세요.</p>
        </main>;
    }

    if (phase === "done" && publishedUid) {
        return <main id="main-content" className="page-shell narrow-page">
            <section className="compose-done">
                <p className="eyebrow">발행 완료</p>
                <h1>판단이 온체인에 기록되었습니다.</h1>
                <p className="mono">UID {publishedUid}</p>
                <a className="text-link" href={routeToHash({name: "decision", uid: publishedUid})}>
                    이 판단 열기 →
                </a>
                <a className="text-link" href={routeToHash({name: "feed", query: ""})}>
                    공개 피드로 →
                </a>
            </section>
        </main>;
    }

    const preset = PRESETS[presetIndex];
    const threshold = parseThreshold(thresholdText);
    const previewWindow = alignWindow(Math.floor(Date.now() / 1000), preset.durationSeconds, preset.delaySeconds);
    const canPublish = threshold !== undefined && phase !== "publishing";

    async function handlePublish() {
        if (!session || threshold === undefined) return;
        setErrorMsg(undefined);
        setNotice(undefined);
        setPhase("publishing");
        try {
            // 서명 직전에 체인 시각을 다시 읽는다. 폼을 열어둔 채 시간이 흐르면
            // 미리보기에서 계산한 창이 과거가 되고, 과거 창은 온체인에서 되돌아간다.
            const block = await publicClient.getBlock();
            const now = Number(block.timestamp);
            const obsWindow: Window = alignWindow(now, preset.durationSeconds, preset.delaySeconds);
            const problem = validateWindow(obsWindow, now);
            if (problem !== "ok") {
                setNotice(`관측 구간을 다시 계산했습니다. 미리보기를 확인하고 다시 발행해 주세요. (${problem})`);
                setPhase("form");
                return;
            }

            const salts = newSalts();
            const input: ComposeInput = {attester: session.address, op, threshold, window: obsWindow, reason, salts};
            const fields = buildDecisionFields(input);
            const data = encodeAbiParameters(DECISION_PARAMETERS, [...fields]);

            const {request} = await publicClient.simulateContract({
                address: EAS_ADDRESS,
                abi: EAS_ABI,
                functionName: "attest",
                account: session.address,
                args: [{
                    schema: SCHEMAS.decision,
                    data: {
                        recipient: "0x0000000000000000000000000000000000000000",
                        expirationTime: 0n,
                        revocable: false,
                        refUID: ZERO_UID,
                        data,
                        value: 0n,
                    },
                }],
                value: 0n,
            });
            const txHash = await session.client.writeContract(request);
            const receipt = await publicClient.waitForTransactionReceipt({hash: txHash});
            if (receipt.status === "reverted") {
                throw new Error(`트랜잭션이 온체인에서 실패했습니다. ${txHash}`);
            }

            // 영수증의 Attested 이벤트에서 UID를 읽는다. simulateContract의 반환값은 쓰지 않는다 —
            // EAS UID는 블록 시각을 포함하므로 시뮬레이션 값과 실제 채굴된 값이 다르다.
            let uid: Hex | undefined;
            for (const log of receipt.logs) {
                try {
                    const decoded = decodeEventLog({abi: EAS_ABI, eventName: "Attested", data: log.data, topics: log.topics});
                    uid = decoded.args.uid;
                    break;
                } catch {
                    // 다른 컨트랙트가 남긴 로그다.
                }
            }
            if (!uid) throw new Error("발행 영수증에서 UID를 찾지 못했습니다.");

            if (reason.trim()) downloadReasonReveal(uid, salts.reason, reason.trim());

            setPublishedUid(uid);
            setPhase("done");
        } catch (error) {
            setErrorMsg(publishErrorMessage(error));
            setPhase("form");
        }
    }

    return <main id="main-content" className="page-shell narrow-page">
        <header className="compose-header">
            <p className="eyebrow">NEW DECISION</p>
            <h1>새 판단을 작성합니다.</h1>
            <p>이 판단은 되돌릴 수 없습니다. 발행하면 온체인에 영구히 남습니다.</p>
            <p>지갑을 연결하지 않아도 모든 기록을 읽을 수 있습니다. 연결은 발행할 때만 필요합니다.</p>
        </header>

        <form
            className="compose-form"
            onSubmit={(event) => {
                event.preventDefault();
                void handlePublish();
            }}
        >
            <fieldset>
                <legend>조건</legend>
                <label className="chip">
                    <input type="radio" name="op" checked={op === 0} onChange={() => setOp(0)} />
                    <span>비트코인 원화 종가가 임계값을 넘는다</span>
                </label>
                <label className="chip">
                    <input type="radio" name="op" checked={op === 2} onChange={() => setOp(2)} />
                    <span>비트코인 원화 종가가 임계값 아래로 내려간다</span>
                </label>
            </fieldset>

            <label className="compose-field">
                <span>임계값 (KRW)</span>
                <input
                    type="text"
                    inputMode="numeric"
                    value={thresholdText}
                    onChange={(event) => setThresholdText(event.target.value)}
                    placeholder="91500000"
                />
                {currentPrice && <small>현재 업비트 시세 참고 — {currentPrice}원</small>}
            </label>

            <fieldset>
                <legend>관측 구간</legend>
                {PRESETS.map((option, index) => <label className="chip" key={option.label}>
                    <input
                        type="radio"
                        name="preset"
                        checked={presetIndex === index}
                        onChange={() => setPresetIndex(index)}
                    />
                    <span>{option.label}</span>
                </label>)}
            </fieldset>

            <label className="compose-field">
                <span>이유 (선택, 이 브라우저에만 저장되고 파일로 내려받습니다)</span>
                <textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    rows={3}
                    placeholder="현물 유입이 늘고 있다"
                />
            </label>

            <section className="compose-preview" aria-label="온체인에 올라갈 내용 미리보기">
                <p className="eyebrow">미리보기 — 온체인에 정확히 이렇게 올라갑니다</p>
                {threshold !== undefined
                    ? <h2>{decisionText(op, threshold)}</h2>
                    : <p className="ink-faint">임계값을 입력해 주세요.</p>}
                <p>
                    관측 구간 <time>{formatUtcMinute(BigInt(previewWindow.start))}</time>
                    <span aria-hidden="true"> → </span>
                    <time>{formatUtcMinute(BigInt(previewWindow.end))}</time>
                </p>
                <p className="mono">발행자 {shortHex(session.address)}</p>
                {reason.trim() && <p>이유 커밋 포함 — 원문은 발행 뒤 파일로 내려받습니다.</p>}
            </section>

            {notice && <p className="compose-notice" role="status">{notice}</p>}
            {errorMsg && <p className="compose-error" role="alert">{errorMsg}</p>}

            <button type="submit" className="compose-submit" disabled={!canPublish}>
                {phase === "publishing" ? "발행 중…" : "발행하기"}
            </button>
        </form>
    </main>;
}
