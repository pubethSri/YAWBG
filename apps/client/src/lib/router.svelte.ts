export type Route =
  | { name: "home" }
  | { name: "room"; code: string }
  | { name: "display"; code: string };

let path = $state(window.location.pathname);

window.addEventListener("popstate", () => {
  path = window.location.pathname;
});

export function navigate(to: string): void {
  history.pushState({}, "", to);
  path = to;
}

function match(p: string): Route {
  const m = p.match(/^\/(room|display)\/([A-Za-z]{4})$/);
  if (m) return { name: m[1] as "room" | "display", code: m[2]!.toUpperCase() };
  return { name: "home" };
}

export const route = {
  get current(): Route {
    return match(path);
  },
};
