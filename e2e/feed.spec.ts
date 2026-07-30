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
        await expect(page.getByLabel("상태: 기한초과").first()).toBeVisible();
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

test("S3-보강 정산을 등록하지 않은 발행자가 사라진다", async ({page}) => {
    await page.goto("/#/feed");
    const baseline = await snapshot(page);

    await page.getByLabel("발행자별 활성 정산 최소 건수").fill("1");
    await expect(page).toHaveURL(/match=1/);

    const filtered = await snapshot(page);
    expect(filtered.issuers.length).toBeLessThan(baseline.issuers.length);
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
    // 온체인 결정 10건에 이 값(91,829,000원)을 대입하면 8건은 맞고 2건은 틀린다 —
    // 조건식(threshold·op)이 서로 다르기 때문이다. 창은 이미 닫힌 과거라 이 대응은 불변이다.
    const OBSERVED_CLOSE = 91_829_000;
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
    // 고정 응답이므로 정확한 수를 안다. "0건이 아니다"로는 카드가 사라져도 통과한다.
    await expect(page.locator("[data-verdict]")).toHaveCount(10);
    await expect(page.locator('[data-verdict="match"]')).toHaveCount(8);
    await expect(page.locator('[data-verdict="mismatch"]')).toHaveCount(2);

    // 배지 자체가 출처를 밝히는지 — hover 에만 있으면 온체인 기록으로 읽힌다.
    await expect(page.locator("[data-verdict]").first()).toContainText("화면 재계산");
    await expect(page.locator("[data-verdict]").first()).toContainText("업비트 1분봉");

    // 전역 고지도 보이는지.
    await expect(page.getByText("판정은 이 화면이 업비트 1분봉으로 다시 계산한 결과입니다. 온체인에 기록된 판정이 아닙니다.")).toBeVisible();
});

test("@smoke S8-실서비스 업비트를 실제로 불러 판정이 뜬다", async ({page}) => {
    // 실서비스 확인은 별도로 둔다. 업비트가 죽어도 S8 게이트는 안 깨진다.
    await page.goto("/#/feed");
    await expect(page.locator(DECISION_ROWS)).not.toHaveCount(0);
    await expect(page.locator("[data-verdict]")).not.toHaveCount(0);
});
