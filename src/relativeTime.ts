const MINUTE = 60n;
const HOUR = 3600n;
const DAY = 86_400n;
const MONTH = 2_592_000n;

/**
 * 카드 상단의 시각 표기.
 * 관측 구간은 공유 링크의 지역차를 막기 위해 UTC 문자열을 쓰지만,
 * 발행 시점은 피드에서 흐름을 읽히게 하려고 상대시간으로 보여준다.
 * 정확한 값은 호출부가 `<time dateTime>`과 `title`에 UTC로 함께 싣는다.
 */
export function relativeTime(target: bigint, now: bigint): string {
    const elapsed = now - target;
    // 체인 시각이 블록 사이에서 앞서 보일 수 있으므로 음수를 만들지 않는다.
    if (elapsed < MINUTE) return "방금";
    if (elapsed < HOUR) return `${elapsed / MINUTE}분 전`;
    if (elapsed < DAY) return `${elapsed / HOUR}시간 전`;
    if (elapsed < MONTH) return `${elapsed / DAY}일 전`;
    return `${elapsed / MONTH}개월 전`;
}
