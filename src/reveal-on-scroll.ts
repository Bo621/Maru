/**
 * 카드가 시야에 들어올 때 한 번만 나타나게 한다.
 * 피드가 마타리는 느낌은 소셜 화면의 감각 중 큰 부분이다.
 */
export function observeReveals(root: ParentNode): () => void {
    if (typeof IntersectionObserver === "undefined") return () => {};
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {};

    const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            entry.target.setAttribute("data-revealed", "");
            observer.unobserve(entry.target);
        }
    }, {rootMargin: "0px 0px -10% 0px"});

    for (const element of root.querySelectorAll("[data-feed-row]")) {
        observer.observe(element);
    }
    return () => observer.disconnect();
}
