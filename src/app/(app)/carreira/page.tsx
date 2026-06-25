import { prisma } from "@/lib/prisma";

export default async function CareerPage() {
  const tracks = await prisma.careerTrack.findMany({
    include: { stages: { orderBy: { order: "asc" }, include: { requirements: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">Plano de Carreira</h1>
      <p className="mt-1 text-sm text-slate-500">
        Trilhas parametrizáveis por área (RH-CAR-01). Promoção mínima: 70/100 pontos · janelas em fevereiro e agosto ·
        N5+ passa por comitê.
      </p>

      <div className="mt-6 space-y-6">
        {tracks.map((track) => (
          <div key={track.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="font-medium text-slate-900">{track.name}</h2>
            <div className="mt-3 space-y-2">
              {track.stages.map((stage) => (
                <div key={stage.id} className="rounded-md bg-slate-50 p-3 text-sm">
                  <p className="font-medium text-slate-800">
                    {stage.level} {stage.typicalMonths ? `· ${stage.typicalMonths}` : ""}
                  </p>
                  <p className="mt-1 text-slate-600">{stage.masteryCriteria}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
        {tracks.length === 0 && (
          <p className="text-sm text-slate-400">Nenhuma trilha cadastrada ainda.</p>
        )}
      </div>
    </div>
  );
}
