import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const appTitle = "Prompt for Good Agent Admin";

const routeTitles: Array<{
  title: string;
  matches: (pathname: string) => boolean;
}> = [
  { title: "Sign in", matches: (pathname) => pathname === "/login" },
  {
    title: "Configuration",
    matches: (pathname) =>
      pathname === "/" || pathname.startsWith("/configuration"),
  },
];

/** Maps the current admin route to the screen title shown in the browser tab. */
function titleFromPathname(pathname: string) {
  const normalizedPathname = pathname.replace(/\/+$/, "") || "/";
  return (
    routeTitles.find((routeTitle) =>
      routeTitle.matches(normalizedPathname),
    )?.title ?? appTitle
  );
}

/** Keeps the browser title aligned with React Router instead of static HTML. */
export function useDocumentTitle() {
  const { pathname } = useLocation();

  useEffect(() => {
    const screenTitle = titleFromPathname(pathname);
    document.title =
      screenTitle === appTitle ? appTitle : `${screenTitle} | ${appTitle}`;
  }, [pathname]);
}
