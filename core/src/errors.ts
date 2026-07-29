import {keccak256, toBytes, type Hex} from "viem";

/** 사용자가 실패 원인뿐 아니라 다음 행동도 알 수 있도록 안내한다. */
export const RESOLVER_ERROR_MESSAGES: Record<string, string> = {
    NotInitialized: "리졸버가 초기화되지 않았습니다. 관리자에게 초기화를 요청해 주세요.",
    AlreadyInitialized: "리졸버가 이미 초기화되었습니다. 기존 설정을 사용해 주세요.",
    MustBePermanent: "만료 시각이 설정된 기록은 발행할 수 없습니다. POI 기록은 만료되지 않습니다.",
    WrongSchema: "이 리졸버와 맞지 않는 스키마입니다. 올바른 스키마 UID를 확인해 주세요.",
    EmptyCommitment: "내용 증명 commitment가 비어 있습니다. 공개할 내용으로 commitment를 만들어 주세요.",
    RecipientMustBeZero: "수신자는 영 주소여야 합니다. recipient를 0x0으로 설정해 주세요.",
    ZeroSchemaUID: "스키마 UID가 비어 있습니다. 등록된 스키마 UID를 넣어 주세요.",
    RenounceDisabled: "소유권 포기는 비활성화되어 있습니다. 현재 소유자를 유지해 주세요.",
    MustBeIrrevocable: "철회 가능한 기록은 발행할 수 없습니다. revocable을 false로 설정해 주세요.",
    RefUIDMustBeZero: "이 기록은 다른 기록을 참조할 수 없습니다. refUID를 0으로 설정해 주세요.",
    MalformedPayload: "기록 데이터 형식이 올바르지 않습니다. 해당 스키마의 필드와 인코딩을 확인해 주세요.",
    MetricFrozen: "이미 동결된 지표는 수정할 수 없습니다. 새 지표 ID를 사용해 주세요.",
    ZeroMetricId: "지표 ID가 비어 있습니다. 0이 아닌 지표 ID를 사용해 주세요.",
    MetricMustBeAllowed: "지표를 허용하려면 allowed를 true로 설정해 주세요.",
    MetricDefinitionRequired: "지표 정의가 비어 있습니다. 지표를 설명하는 정의를 입력해 주세요.",
    MetricKindUnsupported: "지원하지 않는 지표 종류입니다. 지원되는 kind를 선택해 주세요.",
    TooManyParents: "부모 기록이 너무 많습니다. 허용된 개수 이하로 줄여 주세요.",
    RefUIDMismatch: "설명 데이터의 refUID가 기록의 refUID와 다릅니다. 두 값을 같게 맞춰 주세요.",
    ParentNotFound: "부모 결정을 찾을 수 없습니다. 존재하는 부모 UID를 확인해 주세요.",
    ParentWrongSchema: "부모 기록의 스키마가 올바르지 않습니다. 결정 스키마의 UID를 사용해 주세요.",
    ParentNotSameActor: "부모 결정의 작성자가 다릅니다. 같은 작성자의 결정만 연결해 주세요.",
    ParentNotEarlier: "부모 결정이 현재 결정보다 이르지 않습니다. 더 먼저 발행된 결정을 선택해 주세요.",
    ParentRevoked: "철회된 부모 결정은 연결할 수 없습니다. 활성 상태인 결정을 선택해 주세요.",
    NoteNotFound: "참조한 노트를 찾을 수 없습니다. 존재하는 노트 UID를 확인해 주세요.",
    NoteWrongSchema: "참조한 노트의 스키마가 올바르지 않습니다. 노트 스키마의 UID를 사용해 주세요.",
    NoteNotSameActor: "참조한 노트의 작성자가 다릅니다. 같은 작성자의 노트를 선택해 주세요.",
    NoteNotEarlier: "참조한 노트가 현재 결정보다 이르지 않습니다. 더 먼저 발행된 노트를 선택해 주세요.",
    BadVerifiedUID: "검증 기록 UID가 유효하지 않습니다. 조건에 맞는 검증 기록을 확인해 주세요.",
    VerifiedAddressNotConfigured:
        "도장 검증 출처가 아직 설정되지 않았습니다. 지금은 검증 지갑 표시 없이 발행해 주세요.",
    VerifiedAddressWrongSchema: "도장 검증 기록이 아닙니다. 다른 스키마의 기록은 사용할 수 없습니다.",
    VerifiedAddressWrongIssuer: "도장이 발급한 검증 기록이 아닙니다.",
    ZeroIssuer: "발급자 주소가 비어 있습니다.",
    SourceRequired: "관측 출처를 적어야 합니다. 출처가 없으면 제3자가 같은 관측을 재현할 수 없습니다.",
    VerifierVersionRequired: "검증기 버전을 적어야 합니다.",
    SourceTooLong: "관측 출처는 64바이트를 넘을 수 없습니다.",
    VerifierVersionTooLong: "검증기 버전은 32바이트를 넘을 수 없습니다.",
    RegistryIsSealed: "지표 레지스트리가 봉인되어 더 이상 지표를 추가할 수 없습니다.",
    VerifiedAddressExpired: "검증 상태의 유효기간이 지났습니다. 지갑을 다시 검증한 뒤 커밋해 주세요.",
    VerifiedAddressRevoked: "검증이 철회된 지갑입니다. 검증 없이 진행하려면 검증 UID를 비워 주세요.",
    MetricNotAllowed: "허용되지 않은 지표입니다. 레지스트리에서 허용된 지표를 선택해 주세요.",
    OpOutOfRange: "비교 연산자 값이 범위를 벗어났습니다. 지원되는 op 값을 선택해 주세요.",
    WindowInPast: "관측 구간의 시작이 현재보다 과거입니다. 결과를 알기 전에 결정했다는 것을 증명하려면 구간이 미래여야 합니다.",
    WindowStartTooFar: "관측 구간의 시작이 너무 멉니다. 허용된 미래 범위 안으로 시작 시각을 조정해 주세요.",
    WindowInvalid: "관측 구간의 시작과 종료가 올바르지 않습니다. 종료 시각을 시작 시각보다 뒤로 설정해 주세요.",
    WindowTooLong: "관측 구간이 너무 깁니다. 허용된 최대 길이 이하로 줄여 주세요.",
    GraceOutOfRange: "유예 기간은 1시간 이상 30일 이하여야 합니다.",
    OutcomeFieldsMustBeZero: "결과 판정이 없는 결정에는 관측 관련 값을 넣을 수 없습니다. 결과 필드를 모두 0으로 설정해 주세요.",
    MustBeRevocable: "철회할 수 없는 기록은 발행할 수 없습니다. revocable을 true로 설정해 주세요.",
    ResultOutOfRange: "결과 값이 범위를 벗어났습니다. 지원되는 result 값을 선택해 주세요.",
    DecisionNotFound: "결과를 등록할 결정을 찾을 수 없습니다. 존재하는 결정 UID를 확인해 주세요.",
    DecisionWrongSchema: "결과 등록 대상의 스키마가 올바르지 않습니다. 결정 스키마의 UID를 사용해 주세요.",
    NotDecisionOwner: "결정 작성자만 결과를 등록할 수 있습니다. 결정을 작성한 계정으로 다시 시도해 주세요.",
    DecisionRevoked: "철회된 결정은 결과를 등록할 수 없습니다. 활성 상태인 결정을 선택해 주세요.",
    DecisionHasNoOutcome: "결과 판정이 없는 결정은 결과를 등록할 수 없습니다. 결과 조건이 있는 결정을 선택해 주세요.",
    WindowNotEnded: "관측 구간이 아직 끝나지 않았습니다. 종료 시각 이후에 결과를 등록해 주세요.",
    ObservedAtMustBeWindowEnd: "관측 시각은 구간 종료 시각과 같아야 합니다. observedAt을 종료 시각으로 맞춰 주세요.",
    MustBeIndeterminate: "관측값이 없으면 결과는 미결정이어야 합니다. result를 INDETERMINATE로 설정해 주세요.",
    IndeterminateHasValue: "미결정 결과에는 관측값을 넣을 수 없습니다. 관측값 필드를 비워 주세요.",
    ResultMismatch: "제출한 결과가 관측값과 맞지 않습니다. 판정은 컨트랙트가 계산하므로 관측값을 확인해 주세요.",
    MustSupersede: "이미 결과를 등록한 결정입니다. 정정하려면 이전 등록을 철회하고 supersedes에 그 UID를 넣어 주세요.",
    PriorStillActive: "이전 결과 등록이 아직 활성 상태입니다. 먼저 이전 등록을 철회해 주세요.",
    SupersedesNotLastHead: "supersedes가 마지막 결과 등록을 가리키지 않습니다. 가장 최근 결과 등록 UID를 넣어 주세요.",
    SupersedesWrongSchema: "정정 대상의 스키마가 올바르지 않습니다. 결과 등록 스키마의 UID를 사용해 주세요.",
    SupersedesNotRevoked: "정정 대상 결과 등록이 철회되지 않았습니다. 먼저 해당 등록을 철회해 주세요.",
    SettlementNotFound: "이의를 제기할 결과 등록을 찾을 수 없습니다. 존재하는 결과 등록 UID를 확인해 주세요.",
    SettlementWrongSchema: "이의 대상의 스키마가 올바르지 않습니다. 결과 등록 스키마의 UID를 사용해 주세요.",
    SettlementRevoked: "철회된 결과 등록에는 이의를 제기할 수 없습니다. 활성 상태인 결과 등록을 선택해 주세요.",
    AlreadyChallenged: "이 결과 등록에 이미 이의를 제기하셨습니다. 새로 제기하려면 기존 이의를 철회해 주세요.",
};

const ERROR_BY_SELECTOR = new Map<string, {name: string; message: string}>(
    Object.entries(RESOLVER_ERROR_MESSAGES).map(([name, message]) => [
        keccak256(toBytes(`${name}()`)).slice(0, 10).toLowerCase(),
        {name, message},
    ]),
);

export function resolverErrorBySelector(
    selector: Hex,
): {name: string; message: string} | undefined {
    return ERROR_BY_SELECTOR.get(selector.toLowerCase());
}

export function messageFromRevert(data: Hex): string | undefined {
    if (!/^0x[0-9a-fA-F]{8,}$/.test(data)) return undefined;
    return resolverErrorBySelector(data.slice(0, 10) as Hex)?.message;
}
