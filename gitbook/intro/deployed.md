# 배포와 주소

> 마루는 이 컨트랙트를 배포하지 않았다. POI 프로토콜이 배포했고, 마루는
> 기존 스키마로 읽고 쓰기만 한다 — [새 컨트랙트 0개](../protocol/no-contracts.md).

## 체인

| | |
|---|---|
| 이름 | GIWA Sepolia |
| chainId | `91342` |
| RPC | `https://sepolia-rpc.giwa.io/` |
| 익스플로러 | `https://sepolia-explorer.giwa.io` |

## 컨트랙트 (POI와 공유 · 전부 Pass - Verified)

| 이름 | 주소 |
|---|---|
| EAS | `0x4200000000000000000000000000000000000021` |
| Decision Resolver | `0x0f25917176a405bb9022e5b417e0d57348b30f89` |
| Settlement Resolver | `0x167cf06df663c5ddde9f20a748e724b4fb6c14fa` |
| (기타 리졸버 2종 — Note · Challenge) | `0xef4422c035bcce0599e4c951a24059abf707595f`, `0x7eefdd7d89d434061cbdb22244d52e78c94e6008` |

## 스키마

| | UID |
|---|---|
| 결정(decision) | `0x88990bf8da2b83b2f68c5783dc1a4375f9f956185c6bafcbd97f7de6d5aa3749` |
| 정산(settlement) | `0x54c112d4e35161c8b2547a52e450d3f69d4e2199021fbc0035e8e4aa7f23dd6e` |

## 화면 배포

```
https://maru-web-production-0407.up.railway.app     HTTP 200
```

Railway 서비스는 POI(`poi-static-production`)와 **별도**다 — 같은 컨트랙트를
가리키지만 다른 저장소, 다른 배포 파이프라인이다.

## 배포 블록

`31997246`부터 로그를 읽는다. 공개 RPC가 `eth_getLogs`를 90,000블록 단위로
제한하므로, 이 블록부터 최신까지 청크로 나눠 읽는다 — 마지막 청크는
`toBlock: "latest"`를 써야 방금 채굴된 블록을 놓치지 않는다.

## 주소가 맞는지 스스로 확인하는 검사

```bash
node scripts/check_docs_onchain.mjs
```

EAS·리졸버 두 곳에 실제 배포 코드가 있는지, 두 스키마 UID가 스키마 레지스트리에서
각각 올바른 리졸버를 가리키는지 확인한다. 문서의 주소가 "문자열 형식만 맞는 상태"로
굳지 않도록 배포마다 돈다.
