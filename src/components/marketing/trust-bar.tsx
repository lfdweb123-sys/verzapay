const STATS = [
  { value: "< 3 min", label: "Vérification KYC marchand" },
  { value: "12 pays", label: "Couverture Ouest africaine" },
  { value: "98,2 %", label: "Taux de succès des paiements" },
  { value: "1,5 %", label: "Commission par défaut, dégressive" },
];

export function TrustBar() {
  return (
    <section className="border-y border-ink-100 bg-ink-50/60">
      <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-8">
          {STATS.map((s) => (
            <div key={s.label} className="text-center sm:text-left">
              <p className="text-2xl sm:text-3xl font-medium text-ink-900 tabular-nums">{s.value}</p>
              <p className="text-xs sm:text-sm text-ink-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
