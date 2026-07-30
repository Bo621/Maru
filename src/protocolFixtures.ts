/**
 * POI 프로토콜이 컨트랙트 상태(기한초과·등록완료·철회 이력)를 보여주려고
 * 발행한 시연 기록. 「비트코인 원화 종가가 1원을 넘는다」처럼 시세 판단으로
 * 읽히면 장난처럼 보이지만, 실제로는 소비자 판단이 아니다.
 *
 * 임계값이나 REASON 유무 같은 휴리스틱으로 걸러내지 않는다 — 남의 판단을
 * 잘못 낙인찍을 수 있다. 그래서 체인에서 실측 확인한 UID를 명시적으로 나열한다.
 * 이 목록에 없으면 표시하지 않는다. 모르는 것을 시연이라고 부르지 않는다.
 */
export const PROTOCOL_FIXTURE_UIDS: ReadonlySet<string> = new Set([
    "0x3f592f21a7e5a733d3dd90caeb2f9ec35bffa335b69da7310749694283e16938",
    "0x5941a398a8338b99d053309cbf5e611486f30e649c9569cfa3a63d5060443888",
    "0xb1e4628344ade15e9779b4f0398f3d6ddf820b92094c4c84fe8304a68a683b21",
    "0xe015bb0a57ef32f7fa579a0ed7951555405ea6febdbe63fb4ceece0e468786db",
    "0x5d2a066cec47c29327e955c11a46ca028fe8a8ecda62cffc8b29bf4441570606",
]);

export function isProtocolFixture(uid: string): boolean {
    return PROTOCOL_FIXTURE_UIDS.has(uid.toLowerCase());
}
