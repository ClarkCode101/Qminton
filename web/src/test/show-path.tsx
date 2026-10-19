import { useLocation } from "react-router";

// Prints the current URL so tests can check where navigation went.
export function ShowPath() {
  const location = useLocation();
  return <p>path: {location.pathname}</p>;
}
