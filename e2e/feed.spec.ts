import {expect, test} from "@playwright/test";
import type {Page} from "@playwright/test";

const DECISION_ROWS = '[data-feed-row][data-kind="decision"]';

async function snapshot(page: Page): Promise<{count: number; issuers: string[]; blocks: number[]}> {
    const rows = page.locator(DECISION_ROWS);
    await expect(rows).not.toHaveCount(0);
    const data = await rows.evaluateAll((elements) => elements.map((element) => ({
        attester: element.getAttribute("data-attester") ?? "",
        block: element.getAttribute("data-block-number"),
    })));
    return {
        count: data.length,
        issuers: [...new Set(data.map((item) => item.attester))],
        // 속성이 없는 행은 건너뛴다. 0으로 읽으면 정렬이 깨진 것처럼 보인다.
        blocks: data.filter((item) => item.block !== null).map((item) => Number(item.block)),
    };
}

test("S1~S4 공개 피드 심사 시나리오", async ({page, context}) => {
    await page.goto("/#/feed");

    const baseline = await test.step("S1 여러 지갑의 결정을 시간 역순 피드로 보여준다", async () => {
        await expect(page.getByRole("heading", {name: "검증된 판단의 공개 피드"})).toBeVisible();
        await expect(page.getByText("이 목록은 조회된 기록의 나열입니다. 순위나 성과 지표가 아닙니다.")).toBeVisible();
        await expect(page.getByText("조회된 것이 전부라는 보장은 없습니다.")).toBeVisible();
        await expect(page.locator("[data-feed-row]")).not.toHaveCount(0);

        const captured = await snapshot(page);
        expect(captured.issuers.length).toBeGreaterThanOrEqual(2);
        const descending = [...captured.blocks].sort((left, right) => right - left);
        expect(captured.blocks).toEqual(descending);
        return captured;
    });

    await test.step("S2 도장 검증 필터를 켜면 검증 라벨이 붙은 결정만 남는다", async () => {
        await page.getByLabel("도장 검증 지갑만").check();

        await expect(page).toHaveURL(/verified=1/);
        const decisionRows = page.locator('[data-feed-row][data-kind="decision"]');
        await expect(decisionRows).not.toHaveCount(0);
        await expect(decisionRows.locator("[data-verification]")).toHaveCount(await decisionRows.count());

        const filtered = await snapshot(page);
        expect(filtered.count).toBeLessThan(baseline.count);
    });

    await test.step("S3 활성 정산 최소 건수를 URL과 피드에 적용한다", async () => {
        await page.getByLabel("발행자별 활성 정산 최소 건수").fill("1");

        await expect(page).toHaveURL(/match=1/);
        const decisionRows = page.locator('[data-feed-row][data-kind="decision"]');
        await expect(decisionRows).not.toHaveCount(0);
        const counts = await decisionRows.evaluateAll((rows) =>
            rows.map((row) => Number(row.getAttribute("data-settled-count"))),
        );
        expect(counts.every((count) => count >= 1)).toBe(true);

        // 정산 필터는 발행자 단위다. 필터를 통과한 발행자의 결정은
        // 개별 결정의 정산 여부와 무관하게 전부 남아야 한다 — 「미발행을 숨기지 않는다」.
        // page 는 S4로 이어지는 필터 상태(verified=1 등)를 쌓아 가는 중이므로
        // 별도 페이지·URL 직행으로 확인해 그 상태를 건드리지 않는다.
        const probe = await context.newPage();
        await probe.goto("/#/feed?settled=1");
        const settledRows = probe.locator('[data-feed-row][data-kind="decision"]');
        await expect(settledRows).not.toHaveCount(0);
        const targetIssuer = await settledRows.first().getAttribute("data-attester");
        const settledUIDs = await settledRows.evaluateAll(
            (rows, attester) => rows.filter((row) => row.getAttribute("data-attester") === attester)
                .map((row) => row.getAttribute("data-uid")),
            targetIssuer,
        );

        await probe.goto("/#/feed");
        const unfilteredRows = probe.locator('[data-feed-row][data-kind="decision"]');
        await expect(unfilteredRows).not.toHaveCount(0);
        const unfilteredUIDs = await unfilteredRows.evaluateAll(
            (rows, attester) => rows.filter((row) => row.getAttribute("data-attester") === attester)
                .map((row) => row.getAttribute("data-uid")),
            targetIssuer,
        );
        expect(new Set(unfilteredUIDs)).toEqual(new Set(settledUIDs));
        await probe.close();
    });

    await test.step("S4 공유 링크를 새 창에서 열어도 같은 필터가 복원된다", async () => {
        await page.getByLabel("발행자별 활성 정산 최소 건수").fill("2");
        const sharedURL = page.url();

        const sharedPage = await context.newPage();
        await sharedPage.goto(sharedURL);

        await expect(sharedPage.getByLabel("도장 검증 지갑만")).toBeChecked();
        await expect(sharedPage.getByLabel("발행자별 활성 정산 최소 건수")).toHaveValue("2");
    });
});

test("S3-보강 활성 정산 최소 건수가 실제로 발행자를 거른다", async ({page}) => {
    await page.goto("/#/feed");

    // 임계값 0 — 발행자 집합 A. 비어 있으면 안 된다.
    const atZero = await snapshot(page);
    expect(atZero.issuers.length).toBeGreaterThan(0);

    // 임계값 99 — 도달 불가능한 값이라 발행자 집합 B는 비어 있어야 한다.
    // 데이터가 늘어도 유지되는 성질이라, 필터가 진짜로 거른다는 증거가 된다.
    await page.getByLabel("발행자별 활성 정산 최소 건수").fill("99");
    await expect(page).toHaveURL(/match=99/);
    await expect(page.locator("[data-feed-row]")).toHaveCount(0);

    // 단조성 — B ⊆ A. B가 공집합이므로 자명하게 성립하지만,
    // 위 두 성질과 함께 필터가 임계값에 따라 집합을 줄이기만 한다는 것을 보장한다.
});

test("S5 피드에서 검증까지 끊기지 않고 이어진다", async ({page}) => {
    // 여정 하나에 온체인 페이지 네 개가 순서대로 실제 RPC를 읽으므로 기본 타임아웃보다 여유를 둔다.
    test.setTimeout(300_000);
    await page.goto("/#/feed");

    const firstIssuer = page.locator('[data-feed-row][data-kind="decision"] .address-link').first();
    await expect(firstIssuer).toBeVisible();
    await firstIssuer.click();

    await expect(page).toHaveURL(/#\/p\/0x[0-9a-f]{40}/);
    await expect(page.getByRole("heading", {name: "발행자의 공개 기록"})).toBeVisible();

    const firstDecision = page.locator('[data-feed-row][data-kind="decision"] .card__open').first();
    await expect(firstDecision).toBeVisible();
    await firstDecision.click();

    await expect(page).toHaveURL(/#\/d\/0x[0-9a-f]{64}/);
    await page.getByRole("link", {name: "이 결정 검증하기 →"}).click();

    await expect(page).toHaveURL(/#\/verify\/0x[0-9a-f]{64}/);
    await expect(page.getByRole("heading", {name: "검증하기"})).toBeVisible();
});

test("S6 스레드 배지에서 부모 판단까지 이어진다", async ({page}) => {
    await page.goto("/#/feed");
    await expect(page.locator("[data-feed-row]")).not.toHaveCount(0);

    const badge = page.locator("[data-thread-badge]").first();
    await expect(badge).toBeVisible();
    await badge.click();

    await expect(page.locator("[data-thread]")).toBeVisible();
    await expect(page.locator("[data-thread-node]")).not.toHaveCount(1);
});

test("S7 검증을 통과한 이유 원문에만 해시 일치 표시가 붙는다", async ({page}) => {
    await page.goto("/#/feed");
    await expect(page.locator("[data-feed-row]")).not.toHaveCount(0);

    const reasons = page.locator("[data-reason]");
    // Task 1이 reveal 파일을 심었으므로 최소 한 건은 반드시 보여야 한다.
    // 0건도 통과시키면 로딩과 렌더가 통째로 깨져도 초록색이 된다.
    await expect(reasons).not.toHaveCount(0);

    const count = await reasons.count();
    await expect(reasons.locator("[data-reason-verified]")).toHaveCount(count);
});

test("S8 관측이 끝난 결정에 판정이 붙고 맞음과 틀림이 함께 나온다", async ({page}) => {
    // 모든 창에 같은 종가를 흘려보낸다. `to`(창 종료) 직전 1분에 닫히는 봉 하나만 돌려주면
    // 창 길이와 무관하게 pickObservedClose가 그 봉을 고른다.
    // 아래 시드 10건에 이 값(91,829,000원)을 대입하면 8건은 맞고 2건은 틀린다 —
    // 조건식(threshold·op)이 서로 다르기 때문이다. 창은 이미 닫힌 과거라 이 대응은 불변이다.
    //
    // 카운트는 전역이 아니라 이 10개 UID로 스코프한다. 피드는 살아있는 온체인 결정을
    // 계속 얹으므로, 새로 발행된 결정의 관측 창이 닫혀 판정이 하나 더 붙어도
    // 이 단언은 영향을 받지 않아야 한다.
    const OBSERVED_CLOSE = 91_829_000;
    const MATCH_UIDS = [
        "0x3f592f21a7e5a733d3dd90caeb2f9ec35bffa335b69da7310749694283e16938",
        "0x5941a398a8338b99d053309cbf5e611486f30e649c9569cfa3a63d5060443888",
        "0xb1e4628344ade15e9779b4f0398f3d6ddf820b92094c4c84fe8304a68a683b21",
        "0xe015bb0a57ef32f7fa579a0ed7951555405ea6febdbe63fb4ceece0e468786db",
        "0x5d2a066cec47c29327e955c11a46ca028fe8a8ecda62cffc8b29bf4441570606",
        "0x0ae1540a08fd1f55c52918335b57188ef927aabcc69e75f61e44f8321369185c",
        "0xf34f7a9501a43cd94b74be8cfc7cefede912b05d6e6cca7b0739d4ac5628ef16",
        "0xcb4793731ac5827850b54431fd3bbda815a13ea38626a3ca060a0ac327599e5a",
    ];
    const MISMATCH_UIDS = [
        "0x475a073966f2abc794e8a8e90e8f6918cbf4d18c3ca1830f2fc8039c463d0d8c",
        "0x7f810797670284bebd2b89f40ec7fee7c4bed681f2d53bcc7047af144e3b3183",
    ];
    // 스냅샷을 끊어 실시간 조회 경로를 강제한다. 안 끊으면 담아둔 관측값이 우선해
    // 아래 업비트 목이 통째로 무시되고, 이 테스트는 스냅샷 경로만 두 번 검사하게 된다
    // (그건 S8-보강의 몫이다). 두 경로가 각자 검사돼야 한쪽이 깨질 때 잡힌다.
    await page.route("**/verdicts.json", (route) => route.abort());
    await page.route("**/api.upbit.com/**", async (route) => {
        const url = new URL(route.request().url());
        const windowEndMs = Date.parse(url.searchParams.get("to") ?? "");
        const startedAt = new Date(windowEndMs - 60_000).toISOString().replace(/\.\d+Z$/, "");
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            // Chromium 은 fulfill 한 응답에도 CORS 를 적용한다. ACAO 가 없으면 fetch 가 막혀
            // 판정이 하나도 안 뜨고 테스트가 조용히 실패한다.
            headers: {"access-control-allow-origin": "*"},
            body: JSON.stringify([{candle_date_time_utc: startedAt, trade_price: OBSERVED_CLOSE}]),
        });
    });

    await page.goto("/#/feed");
    await expect(page.locator(DECISION_ROWS)).not.toHaveCount(0);
    await expect(page.locator("[data-verdict]")).not.toHaveCount(0);

    // 제품의 명제는 틀린 판단이 그대로 남는다는 것이다.
    // 맞음만 보이면 이 화면은 자랑판이지 증명이 아니다.
    // 시드 10건으로 정확히 스코프하므로 정확한 수를 안다. "0건이 아니다"로는 카드가 사라져도 통과한다.
    for (const uid of MATCH_UIDS) {
        await expect(page.locator(`[data-uid="${uid}"] [data-verdict]`)).toHaveCount(1);
        await expect(page.locator(`[data-uid="${uid}"] [data-verdict="match"]`)).toHaveCount(1);
    }
    for (const uid of MISMATCH_UIDS) {
        await expect(page.locator(`[data-uid="${uid}"] [data-verdict]`)).toHaveCount(1);
        await expect(page.locator(`[data-uid="${uid}"] [data-verdict="mismatch"]`)).toHaveCount(1);
    }

    // 배지 자체가 출처를 밝히는지 — hover 에만 있으면 온체인 기록으로 읽힌다.
    await expect(page.locator("[data-verdict]").first()).toContainText("화면 재계산");
    await expect(page.locator("[data-verdict]").first()).toContainText("업비트 1분봉");

    // 전역 고지도 보이는지.
    await expect(page.getByText(
        "판정은 업비트 1분봉으로 다시 계산한 결과입니다. 관측이 끝난 구간은 배포 시점에 계산해 담아 둔 값이고, "
        + "새로 끝난 구간은 이 화면이 조회합니다. 온체인에 기록된 판정이 아닙니다.",
    )).toBeVisible();
});

test("S8-보강 업비트를 못 불러도 담아둔 관측값으로 판정이 뜬다", async ({page}) => {
    await page.route("**/api.upbit.com/**", (route) => route.abort());

    await page.goto("/#/feed");
    await expect(page.locator(DECISION_ROWS)).not.toHaveCount(0);
    await expect(page.locator("[data-verdict]")).not.toHaveCount(0);

    // 맞음과 틀림이 둘 다 있어야 한다 — 스냅샷이 실제로 쓰였다는 증거다.
    // 업비트가 완전히 막혔으니 이 값들은 스냅샷 말고는 나올 수 없다.
    await expect(page.locator('[data-verdict="match"]')).not.toHaveCount(0);
    await expect(page.locator('[data-verdict="mismatch"]')).not.toHaveCount(0);
});

test("S9 팔로우가 실제로 거른다", async ({page}) => {
    await page.goto("/#/feed");
    const rows = page.locator(DECISION_ROWS);
    await expect(rows).not.toHaveCount(0);

    const firstAttester = await rows.first().getAttribute("data-attester");
    expect(firstAttester).not.toBeNull();

    await rows.first().locator(".follow-toggle").click();
    await page.getByRole("link", {name: "팔로우"}).click();

    await expect(page).toHaveURL(/tab=follow/);
    const followedRows = page.locator(DECISION_ROWS);
    await expect(followedRows).not.toHaveCount(0);
    const attesters = await followedRows.evaluateAll((elements) =>
        elements.map((element) => element.getAttribute("data-attester")));
    expect(new Set(attesters)).toEqual(new Set([firstAttester]));
});

test("S10 곧 결과 나옴 탭에는 아직 안 끝난 판단만 마감 임박 순으로 뜬다", async ({page}) => {
    await page.goto("/#/feed?tab=soon");
    const rows = page.locator(DECISION_ROWS);
    await expect(rows).not.toHaveCount(0);

    // 결과가 이미 나온 판단이 이 탭에 있으면 안 된다. 개수가 아니라 성질을 본다.
    await expect(page.locator(`${DECISION_ROWS} [data-verdict="match"]`)).toHaveCount(0);
    await expect(page.locator(`${DECISION_ROWS} [data-verdict="mismatch"]`)).toHaveCount(0);

    // 마감 임박 순 = windowEnd 오름차순. ISO 문자열이라 사전순 정렬이 곧 시간순이다.
    const ends = await rows.evaluateAll((els) =>
        els.map((el) => el.querySelectorAll("time")[1]?.getAttribute("datetime") ?? ""));
    expect(ends).not.toContain("");
    expect(ends).toEqual([...ends].sort());
});

test("S10-보강 탭 3개가 전환되고 URL에 남는다", async ({page}) => {
    await page.goto("/#/feed");
    await expect(page.locator(DECISION_ROWS)).not.toHaveCount(0);
    expect(page.url()).not.toMatch(/tab=/);

    await page.getByRole("link", {name: "곧 결과 나옴"}).click();
    await expect(page).toHaveURL(/tab=soon/);
    await expect(page.getByRole("link", {name: "곧 결과 나옴"})).toHaveAttribute("aria-current", "page");

    await page.getByRole("link", {name: "전체"}).click();
    await expect(page).not.toHaveURL(/tab=soon/);
});

test("S4-보강 탭과 필터가 서로를 지우지 않는다", async ({page, context}) => {
    await page.goto("/#/feed");
    await snapshot(page);

    await page.getByLabel("도장 검증 지갑만").click();
    await expect(page.getByLabel("도장 검증 지갑만")).toBeChecked();
    await expect(page).toHaveURL(/verified=1/);

    await page.getByRole("link", {name: "곧 결과 나옴"}).click();
    await expect(page).toHaveURL(/verified=1/);
    await expect(page).toHaveURL(/tab=soon/);

    const sharedURL = page.url();
    const sharedPage = await context.newPage();
    await sharedPage.goto(sharedURL);

    await expect(sharedPage.getByLabel("도장 검증 지갑만")).toBeChecked();
    await expect(sharedPage.getByRole("link", {name: "곧 결과 나옴"})).toHaveAttribute("aria-current", "page");
});

test("S11 지갑 없이 피드가 뜨고 작성 화면은 연결을 안내한다", async ({page}) => {
    await page.goto("/#/feed");
    await expect(page.locator(DECISION_ROWS)).not.toHaveCount(0);
    await page.goto("/#/write");
    await expect(page.getByText("판단을 발행하려면 지갑을 연결해 주세요.")).toBeVisible();
});

test("S12 프로토콜 시연 기록에 구분 표시가 붙는다", async ({page}) => {
    // src/protocolFixtures.ts 와 같은 목록 — 체인에서 실측 확인한 5건.
    // 임계값 등 휴리스틱이 아니라 명시적 UID로 판별하므로 여기서도 그대로 나열한다.
    const FIXTURE_UIDS = [
        "0x3f592f21a7e5a733d3dd90caeb2f9ec35bffa335b69da7310749694283e16938",
        "0x5941a398a8338b99d053309cbf5e611486f30e649c9569cfa3a63d5060443888",
        "0xb1e4628344ade15e9779b4f0398f3d6ddf820b92094c4c84fe8304a68a683b21",
        "0xe015bb0a57ef32f7fa579a0ed7951555405ea6febdbe63fb4ceece0e468786db",
        "0x5d2a066cec47c29327e955c11a46ca028fe8a8ecda62cffc8b29bf4441570606",
    ];
    // S8의 MATCH_UIDS 뒤쪽 2건 — 마루가 발행한 결정이라 구분 표시가 없어야 한다.
    const NON_FIXTURE_UIDS = [
        "0xf34f7a9501a43cd94b74be8cfc7cefede912b05d6e6cca7b0739d4ac5628ef16",
        "0xcb4793731ac5827850b54431fd3bbda815a13ea38626a3ca060a0ac327599e5a",
    ];

    await page.goto("/#/feed");
    await expect(page.locator(DECISION_ROWS)).not.toHaveCount(0);

    for (const uid of FIXTURE_UIDS) {
        await expect(page.locator(`[data-uid="${uid}"]`)).toHaveAttribute("data-fixture", "");
    }
    for (const uid of NON_FIXTURE_UIDS) {
        const row = page.locator(`[data-uid="${uid}"]`);
        await expect(row).toHaveCount(1);
        await expect(row).not.toHaveAttribute("data-fixture", "");
    }

    // 시연 기록이 피드에서 사라지지 않았다 — 5건 전부 렌더된다. 필터로 걸러내지 않는다.
    for (const uid of FIXTURE_UIDS) {
        await expect(page.locator(`[data-uid="${uid}"]`)).toHaveCount(1);
    }
});

test("@smoke S8-실서비스 업비트를 실제로 불러 판정이 뜬다", async ({page}) => {
    // 실서비스 확인은 별도로 둔다. 업비트가 죽어도 S8 게이트는 안 깨진다.
    await page.goto("/#/feed");
    await expect(page.locator(DECISION_ROWS)).not.toHaveCount(0);
    await expect(page.locator("[data-verdict]")).not.toHaveCount(0);
});
