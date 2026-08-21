import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapView } from "@/components/Map";
import { Building2, Globe2, Mail, MapPin, Phone, Search, Users } from "lucide-react";

type DirectoryMarket = {
  id: number;
  name: string;
  state: string;
  isPrimary: boolean;
  isAvailable: boolean;
};

type DirectoryAgent = {
  id: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  profilePhotoUrl: string | null;
  agentStatus: string | null;
  specialties: string[];
  languages: string[];
  productionLevel: string | null;
  bio: string | null;
  teams: string[];
  markets: DirectoryMarket[];
};

const PRODUCTION_LABELS: Record<string, string> = {
  emerging: "Emerging",
  growing: "Growing",
  established: "Established",
  elite: "Elite",
};

function initials(name: string | null) {
  return (name ?? "?").split(" ").map((part) => part[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

function valuesToOptions(values: string[]) {
  return values.map((value) => ({ value, label: value }));
}

function AgentMarketMap({ agents }: { agents: DirectoryAgent[] }) {
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);

  const onMapReady = useCallback((readyMap: google.maps.Map) => setMap(readyMap), []);

  useEffect(() => {
    if (!map || !window.google?.maps?.Geocoder) return;
    let cancelled = false;
    markersRef.current.forEach((marker) => { marker.map = null; });
    markersRef.current = [];

    const byMarket = new Map<string, { market: DirectoryMarket; agents: DirectoryAgent[] }>();
    for (const agent of agents) {
      for (const market of agent.markets) {
        const key = `${market.name}|${market.state}`;
        const entry = byMarket.get(key) ?? { market, agents: [] };
        entry.agents.push(agent);
        byMarket.set(key, entry);
      }
    }

    const geocoder = new window.google.maps.Geocoder();
    const infoWindow = new window.google.maps.InfoWindow();
    const bounds = new window.google.maps.LatLngBounds();
    const locateMarkets = async () => {
      const found = await Promise.all(Array.from(byMarket.values()).map(async ({ market, agents: agentsAtMarket }) => {
        try {
          const result = await geocoder.geocode({ address: `${market.name}, ${market.state}, USA` });
          const location = result.results[0]?.geometry.location;
          if (!location || cancelled) return false;
          const marker = new window.google.maps.marker.AdvancedMarkerElement({
            map,
            position: location,
            title: `${market.name}, ${market.state} — ${agentsAtMarket.length} agent${agentsAtMarket.length === 1 ? "" : "s"}`,
          });
          marker.addListener("click", () => {
            const names = agentsAtMarket.map((agent) => agent.name ?? "Unnamed agent").join(", ");
            infoWindow.setContent(`<div style="min-width:180px"><strong>${market.name}, ${market.state}</strong><br/><span>${names}</span></div>`);
            infoWindow.open({ map, anchor: marker });
          });
          markersRef.current.push(marker);
          bounds.extend(location);
          return true;
        } catch {
          return false;
        }
      }));
      if (!cancelled && found.some(Boolean)) map.fitBounds(bounds, 56);
    };
    void locateMarkets();

    return () => {
      cancelled = true;
      markersRef.current.forEach((marker) => { marker.map = null; });
      markersRef.current = [];
    };
  }, [agents, map]);

  if (agents.length === 0) {
    return <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">No agents match the current filters.</div>;
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="border-b px-4 py-3 text-sm text-muted-foreground">Market locations are grouped by city and show the agents available in each market.</div>
      <MapView className="h-[560px]" initialCenter={{ lat: 39.8283, lng: -98.5795 }} initialZoom={4} onMapReady={onMapReady} />
    </div>
  );
}

export default function AgentDirectoryPage() {
  const { data, isLoading } = trpc.users.agentDirectory.useQuery(undefined, { staleTime: 60_000 });
  const agents = (data ?? []) as DirectoryAgent[];
  const [search, setSearch] = useState("");
  const [markets, setMarkets] = useState<string[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [productionLevels, setProductionLevels] = useState<string[]>([]);
  const [teams, setTeams] = useState<string[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<DirectoryAgent | null>(null);
  const requestedAgentId = typeof window === "undefined"
    ? null
    : Number(new URLSearchParams(window.location.search).get("agent")) || null;

  useEffect(() => {
    if (!requestedAgentId || agents.length === 0) return;
    const requestedAgent = agents.find((agent) => agent.id === requestedAgentId);
    if (requestedAgent) setSelectedAgent(requestedAgent);
  }, [agents, requestedAgentId]);

  const filterOptions = useMemo(() => {
    const marketValues = Array.from(new Set(agents.flatMap((agent) => agent.markets.map((market) => market.name)))).sort();
    const stateValues = Array.from(new Set(agents.flatMap((agent) => agent.markets.map((market) => market.state)))).sort();
    const specialtyValues = Array.from(new Set(agents.flatMap((agent) => agent.specialties))).sort();
    const languageValues = Array.from(new Set(agents.flatMap((agent) => agent.languages))).sort();
    const teamValues = Array.from(new Set(agents.flatMap((agent) => agent.teams))).sort();
    return { marketValues, stateValues, specialtyValues, languageValues, teamValues };
  }, [agents]);

  const filteredAgents = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return agents.filter((agent) => {
      const allText = [
        agent.name, agent.email, agent.phone, agent.title, agent.bio,
        ...agent.specialties, ...agent.languages, ...agent.teams,
        ...agent.markets.flatMap((market) => [market.name, market.state]),
      ].filter(Boolean).join(" ").toLowerCase();
      const matchesSearch = !normalizedSearch || allText.includes(normalizedSearch);
      const matchesMarkets = markets.length === 0 || agent.markets.some((market) => markets.includes(market.name));
      const matchesStates = states.length === 0 || agent.markets.some((market) => states.includes(market.state));
      const matchesSpecialties = specialties.length === 0 || specialties.some((value) => agent.specialties.includes(value));
      const matchesLanguages = languages.length === 0 || languages.some((value) => agent.languages.includes(value));
      const matchesProduction = productionLevels.length === 0 || (agent.productionLevel != null && productionLevels.includes(agent.productionLevel));
      const matchesTeams = teams.length === 0 || teams.some((value) => agent.teams.includes(value));
      return matchesSearch && matchesMarkets && matchesStates && matchesSpecialties && matchesLanguages && matchesProduction && matchesTeams;
    });
  }, [agents, search, markets, states, specialties, languages, productionLevels, teams]);

  const clearFilters = () => {
    setSearch(""); setMarkets([]); setStates([]); setSpecialties([]); setLanguages([]); setProductionLevels([]); setTeams([]);
  };
  const hasFilters = Boolean(search || markets.length || states.length || specialties.length || languages.length || productionLevels.length || teams.length);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="rounded-2xl border bg-gradient-to-br from-sky-50 via-background to-background p-5 sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-primary"><Users className="h-5 w-5" /><span className="text-sm font-semibold">Savvy STR Agents</span></div>
            <h1 className="text-3xl font-bold tracking-tight">Agent Directory</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Find the right Savvy agent quickly by market, team, specialty, language, or production level. Open any agent profile for direct contact details and market coverage.</p>
          </div>
          <Badge variant="outline" className="w-fit bg-background px-3 py-1 text-sm">{filteredAgents.length} of {agents.length} agents</Badge>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="relative md:col-span-2 xl:col-span-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Search an agent, market, specialty, language, or team…" />
          </div>
          <MultiSelect options={valuesToOptions(filterOptions.marketValues)} value={markets} onValueChange={setMarkets} placeholder="All markets" searchPlaceholder="Search markets…" />
          <MultiSelect options={valuesToOptions(filterOptions.stateValues)} value={states} onValueChange={setStates} placeholder="All states" searchPlaceholder="Search states…" />
          <MultiSelect options={valuesToOptions(filterOptions.specialtyValues)} value={specialties} onValueChange={setSpecialties} placeholder="All specialties" searchPlaceholder="Search specialties…" />
          <MultiSelect options={valuesToOptions(filterOptions.languageValues)} value={languages} onValueChange={setLanguages} placeholder="All languages" searchPlaceholder="Search languages…" />
          <MultiSelect options={Object.entries(PRODUCTION_LABELS).map(([value, label]) => ({ value, label }))} value={productionLevels} onValueChange={setProductionLevels} placeholder="All production levels" searchPlaceholder="Search levels…" />
          <MultiSelect options={valuesToOptions(filterOptions.teamValues)} value={teams} onValueChange={setTeams} placeholder="All teams" searchPlaceholder="Search teams…" />
        </div>
        {hasFilters && <div className="mt-3 flex justify-end"><Button variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button></div>}
      </section>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[1, 2, 3, 4, 5, 6].map((item) => <div key={item} className="h-56 animate-pulse rounded-xl bg-muted" />)}</div>
      ) : (
        <Tabs defaultValue="list" className="space-y-4">
          <TabsList><TabsTrigger value="list">List view</TabsTrigger><TabsTrigger value="map">Map view</TabsTrigger></TabsList>
          <TabsContent value="list">
            {filteredAgents.length === 0 ? (
              <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">No agents match the current filters. Try broadening your search.</div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filteredAgents.map((agent) => (
                  <article key={agent.id} className="flex flex-col rounded-xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
                    <div className="flex items-start gap-3">
                      <Avatar className="h-12 w-12"><AvatarImage src={agent.profilePhotoUrl ?? undefined} alt={agent.name ?? ""} /><AvatarFallback className="bg-primary/10 font-semibold text-primary">{initials(agent.name)}</AvatarFallback></Avatar>
                      <div className="min-w-0 flex-1">
                        <button type="button" onClick={() => setSelectedAgent(agent)} className="text-left text-base font-semibold hover:text-primary hover:underline">{agent.name ?? "Unnamed Agent"}</button>
                        <p className="truncate text-sm text-muted-foreground">{agent.title ?? "Savvy STR Agent"}</p>
                      </div>
                      {agent.productionLevel && <Badge variant="outline" className="capitalize">{PRODUCTION_LABELS[agent.productionLevel] ?? agent.productionLevel}</Badge>}
                    </div>
                    <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                      {agent.email && <a href={`mailto:${agent.email}`} className="flex items-center gap-2 hover:text-primary"><Mail className="h-4 w-4 shrink-0" /><span className="truncate">{agent.email}</span></a>}
                      {agent.phone && <a href={`tel:${agent.phone}`} className="flex items-center gap-2 hover:text-primary"><Phone className="h-4 w-4 shrink-0" /><span>{agent.phone}</span></a>}
                      {agent.markets.length > 0 && <div className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0" /><span>{agent.markets.map((market) => `${market.name}, ${market.state}`).join(" · ")}</span></div>}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {agent.specialties.slice(0, 3).map((specialty) => <Badge key={specialty} variant="secondary" className="font-normal">{specialty}</Badge>)}
                      {agent.specialties.length > 3 && <Badge variant="secondary" className="font-normal">+{agent.specialties.length - 3}</Badge>}
                    </div>
                    <div className="mt-auto pt-4"><Button variant="outline" size="sm" className="w-full" onClick={() => setSelectedAgent(agent)}>View agent profile</Button></div>
                  </article>
                ))}
              </div>
            )}
          </TabsContent>
          <TabsContent value="map"><AgentMarketMap agents={filteredAgents} /></TabsContent>
        </Tabs>
      )}

      <Dialog open={selectedAgent != null} onOpenChange={(open) => !open && setSelectedAgent(null)}>
        <DialogContent className="max-w-lg">
          {selectedAgent && <>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <Avatar className="h-14 w-14"><AvatarImage src={selectedAgent.profilePhotoUrl ?? undefined} alt={selectedAgent.name ?? ""} /><AvatarFallback className="bg-primary/10 text-lg font-semibold text-primary">{initials(selectedAgent.name)}</AvatarFallback></Avatar>
                <div><DialogTitle>{selectedAgent.name ?? "Unnamed Agent"}</DialogTitle><DialogDescription>{selectedAgent.title ?? "Savvy STR Agent"}</DialogDescription></div>
              </div>
            </DialogHeader>
            <div className="space-y-5 text-sm">
              <div className="grid gap-2 sm:grid-cols-2">
                {selectedAgent.email && <a href={`mailto:${selectedAgent.email}`} className="flex items-center gap-2 rounded-md border p-2.5 hover:bg-muted"><Mail className="h-4 w-4 text-primary" />{selectedAgent.email}</a>}
                {selectedAgent.phone && <a href={`tel:${selectedAgent.phone}`} className="flex items-center gap-2 rounded-md border p-2.5 hover:bg-muted"><Phone className="h-4 w-4 text-primary" />{selectedAgent.phone}</a>}
              </div>
              {selectedAgent.bio && <div><p className="mb-1 font-medium">About</p><p className="text-muted-foreground">{selectedAgent.bio}</p></div>}
              <div><p className="mb-2 flex items-center gap-1.5 font-medium"><MapPin className="h-4 w-4 text-primary" />Market coverage</p><div className="flex flex-wrap gap-1.5">{selectedAgent.markets.length ? selectedAgent.markets.map((market) => <Badge key={`${market.id}-${market.name}`} variant="secondary">{market.name}, {market.state}{market.isPrimary ? " · Primary" : ""}</Badge>) : <span className="text-muted-foreground">No markets listed yet.</span>}</div></div>
              {selectedAgent.specialties.length > 0 && <div><p className="mb-2 flex items-center gap-1.5 font-medium"><Building2 className="h-4 w-4 text-primary" />Specialties</p><div className="flex flex-wrap gap-1.5">{selectedAgent.specialties.map((specialty) => <Badge key={specialty} variant="secondary">{specialty}</Badge>)}</div></div>}
              {selectedAgent.languages.length > 0 && <div><p className="mb-2 flex items-center gap-1.5 font-medium"><Globe2 className="h-4 w-4 text-primary" />Languages</p><div className="flex flex-wrap gap-1.5">{selectedAgent.languages.map((language) => <Badge key={language} variant="secondary">{language}</Badge>)}</div></div>}
              {selectedAgent.teams.length > 0 && <div><p className="mb-2 flex items-center gap-1.5 font-medium"><Users className="h-4 w-4 text-primary" />Teams</p><div className="flex flex-wrap gap-1.5">{selectedAgent.teams.map((team) => <Badge key={team} variant="outline">{team}</Badge>)}</div></div>}
            </div>
          </>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
