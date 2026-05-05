import { useEffect } from "react";
import { useLocation } from "wouter";

export default function PilotRedirect() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation("/access/pilot-code");
  }, [setLocation]);

  return null;
}
