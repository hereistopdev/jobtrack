import { useEffect, useState } from "react";
import { fetchTeamDirectory } from "../api";

export function useTeamDirectory() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchTeamDirectory()
      .then((data) => {
        if (!cancelled) setMembers(Array.isArray(data.members) ? data.members : []);
      })
      .catch((e) => {
        if (!cancelled) {
          setMembers([]);
          setError(e.message || "Failed to load team");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { members, loading, error };
}
