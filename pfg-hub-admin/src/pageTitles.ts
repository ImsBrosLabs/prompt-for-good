import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const appTitle = "Prompt for Good Admin";

const routeTitles: Array<{
  title: string;
  matches: (pathname: string) => boolean;
}> = [
  { title: "Sign in", matches: (pathname) => pathname === "/login" },
  {
    title: "Operations",
    matches: (pathname) => pathname.startsWith("/operations"),
  },
  { title: "Scoring", matches: (pathname) => pathname.startsWith("/scoring") },
  {
    title: "Repositories",
    matches: (pathname) =>
      pathname === "/" || pathname.startsWith("/repositories"),
  },
  { title: "Issues", matches: (pathname) => pathname.startsWith("/issues") },
  { title: "Runners", matches: (pathname) => pathname.startsWith("/runners") },
  {
    title: "Contributions",
    matches: (pathname) => pathname.startsWith("/contributions"),
  },
  {
    title: "Configuration",
    matches: (pathname) => pathname.startsWith("/configuration"),
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
