import {expect, test} from "@playwright/test";

test("S1~S4 공개 피드 심사 시나리오", async ({page, context}) => {
    await page.goto("/#/feed");

    await test.step("S1 여러 지갑의 결정을 시간 역순 피드로 보여준다", async () => {
        await expect(page.getByRole("heading", {name: "검증된 판단의 공개 피드"})).toBeVisible();
        await expect(page.getByText("이 목록은 조회된 기록의 나열입니다. 순위나 성과 지표가 아닙니다.")).toBeVisible();
        await expect(page.getByText("조회된 것이 전부라는 보장은 없습니다.")).toBeVisible();
        await expect(page.locator("[data-feed-row]")).not.toHaveCount(0);
    });

    await test.step("S2 도장 검증 필터를 켜면 검증 라벨이 붙은 결정만 남는다", async () => {
        await page.getByLabel("도장 검증 지갑만").check();

        await expect(page).toHaveURL(/verified=1/);
        const decisionRows = page.locator('[data-feed-row][data-kind="decision"]');
        await expect(decisionRows).not.toHaveCount(0);
        await expect(decisionRows.locator("[data-verification]")).toHaveCount(await decisionRows.count());
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
