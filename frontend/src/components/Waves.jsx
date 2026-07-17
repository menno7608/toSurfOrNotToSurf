export default function Waves({ data }) {
  return (
    <div className="p-4 bg-white rounded shadow">
      <div className="text-sm font-semibold mb-2">Waves</div>

      {!data?.length ? (
        <div className="text-sm text-slate-500">No data</div>
      ) : (
        <div className="space-y-2 text-sm">
          {data.slice(-8).map((p, idx) => (
            <div key={idx} className="flex justify-between">
              <span className="text-slate-500">{p.t}</span>
              <span>
                Hs {num(p.hs)}m · Tp {num(p.tp)}s
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function num(v) {
  if (v === undefined || v === null) return "—";
  return Number(v).toFixed(1);
}
