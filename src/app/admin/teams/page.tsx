"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { EmptyState, Spinner } from "@/components/ui/badges";
import { UserAvatar } from "@/components/ui/user-avatar";
import { UsersRound, Search, Shield } from "lucide-react";

interface TeamMemberRow {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string | null;
  isOwner: boolean;
}

interface TeamGroup {
  companyId: string;
  companyName: string;
  members: TeamMemberRow[];
}

export default function AdminTeamsPage() {
  const { user } = useAuth();
  const { show } = useToast();
  const [teams, setTeams] = useState<TeamGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const res = await fetch(`/api/admin/teams?uid=${user.uid}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Erreur");
        setTeams(data.teams ?? []);
      } catch (err) {
        show((err as Error).message, "error");
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return teams;
    return teams.filter(
      (t) => t.companyName.toLowerCase().includes(q) || t.members.some((m) => m.displayName.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))
    );
  }, [teams, search]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-medium text-ink-900">Équipes</h1>
        <p className="text-sm text-ink-500">Membres de chaque entreprise sur la plateforme</p>
      </div>

      <div className="card-base p-3">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            type="text"
            placeholder="Rechercher par entreprise ou membre…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-base pl-9 h-9"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : filtered.length === 0 ? (
        <div className="card-base"><EmptyState title="Aucune équipe" icon={UsersRound} /></div>
      ) : (
        <div className="space-y-3">
          {filtered.map((team) => (
            <div key={team.companyId} className="card-base overflow-hidden">
              <div className="px-4 py-3 border-b border-ink-100">
                <p className="text-sm font-medium text-ink-900">{team.companyName}</p>
                <p className="text-xs text-ink-500">{team.members.length} membre(s)</p>
              </div>
              <div className="divide-y divide-ink-50">
                {team.members.map((m) => (
                  <div key={m.uid} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <UserAvatar photoURL={m.photoURL} name={m.displayName} size={32} />
                      <div>
                        <p className="text-sm font-medium text-ink-900">{m.displayName}</p>
                        <p className="text-xs text-ink-500">{m.email}</p>
                      </div>
                    </div>
                    <span className={`badge ${m.isOwner ? "bg-brand-50 text-brand-800" : "bg-ink-100 text-ink-700"}`}>
                      <Shield size={11} /> {m.isOwner ? "Propriétaire" : "Membre"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
