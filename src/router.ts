import type {Address, Hex} from "viem";

export type Route =
    | {name: "feed"; query: string}
    | {name: "passport"; address: Address}
    | {name: "decision"; uid: Hex}
    | {name: "verify"; uid: Hex}
    | {name: "notFound"; raw: string};

export function parseRoute(_hash: string): Route {
    return {name: "feed", query: ""};
}

export function routeToHash(_route: Route): string {
    return "#/feed";
}
