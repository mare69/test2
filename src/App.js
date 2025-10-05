import React, { useMemo, useState } from "react";

// AI Partner – Klepetalnik Analitik (MVP, front-end only)
// - Uporabnik prilepi pogovor
// - Izbere cilj odgovora in ton
// - Aplikacija naredi analizo (lokalna heuristika) + predlog odgovora
// - Pripravljen hook za povezavo z GPT API (glej funkcijo callOpenAI)
// - Brez zunanjih knjižnic; stil s Tailwind razredi (če ni na voljo, še vedno deluje)

const TONES = [
  { key: "neutral", label: "Nevtralen" },
  { key: "warm", label: "Topel/empatičen" },
  { key: "confident", label: "Odločen" },
  { key: "apologetic", label: "Opravičilen" },
  { key: "funny", label: "Humoren (ne vsakič)" },
];

const LENGTHS = [
  { key: "short", label: "Kratko (1–3 stavki)" },
  { key: "medium", label: "Srednje (4–7 stavkov)" },
  { key: "long", label: "Daljše (7–12 stavkov)" },
];

const GOALS = [
  "Pomiriti situacijo",
  "Dogovoriti termin",
  "Postaviti meje",
  "Vprasati za pojasnila",
  "Prodajni odziv",
  "Flirt / simpatičen odgovor",
  "Prekinitev stika (vljudno)",
];

function copy(text) {
  navigator.clipboard.writeText(text);
}

function download(filename, text) {
  const el = document.createElement("a");
  el.setAttribute(
    "href",
    "data:text/plain;charset=utf-8," + encodeURIComponent(text)
  );
  el.setAttribute("download", filename);
  el.style.display = "none";
  document.body.appendChild(el);
  el.click();
  document.body.removeChild(el);
}

function useHeuristicAnalysis(text) {
  return useMemo(() => {
    const lower = text.toLowerCase();
    const metrics = {
      lengthChars: text.length,
      lines: text.split(/\n/).length,
      hasQuestion: /\?/g.test(text),
      exclaims: (text.match(/!/g) || []).length,
      emojis: (text.match(/[\u{1F300}-\u{1FAFF}]/gu) || []).length,
      uppercaseBursts: (text.match(/[A-ZČŠŽ]{4,}/g) || []).length,
    };

    const angerWords = [
      "jezen",
      "noro",
      "kurc",
      "butelj",
      "kdo si",
      "zajeb",
      "razje",
      "jeza",
      "grdo",
      "ignoriraš",
      "zakaj me ignoriraš",
      "banalno",
      "lažeš",
      "nateg",
    ]; // demo
    const sadWords = [
      "žalosten",
      "žal mi je",
      "pogrešam",
      "sam",
      "osamljen",
      "jok",
      "srce",
      "razhod",
      "ločitev",
    ];
    const loveWords = [
      "ljubim",
      "rad te imam",
      "objem",
      "poljub",
      "gaja",
      "srček",
      "draga",
      "dragi",
    ];
    const urgency = [
      "NUJNO",
      "zdej",
      "takoj",
      "deadline",
      "zadnji rok",
      "danes",
    ];

    const score = (arr) =>
      arr.reduce((acc, w) => acc + (lower.includes(w) ? 1 : 0), 0);

    const signals = {
      anger:
        score(angerWords) +
        metrics.uppercaseBursts +
        (metrics.exclaims > 3 ? 1 : 0),
      sadness: score(sadWords),
      affection: score(loveWords),
      urgency: score(urgency),
      question: metrics.hasQuestion ? 1 : 0,
    };

    let vibe = "nevtralno";
    if (signals.anger >= 2) vibe = "jeza / konflikt";
    else if (signals.sadness >= 1) vibe = "žalost / občutljivost";
    else if (signals.affection >= 1) vibe = "naklonjenost";
    else if (signals.urgency >= 1) vibe = "nujno";

    const redFlags = [];
    if (signals.anger >= 2) redFlags.push("povišan ton / konfliktna fraza");
    if (text.length > 1600)
      redFlags.push("predolgo besedilo – predlagaj povzetek");
    if (/\b(denar|posodi|račun|iban|geslo)\b/i.test(text))
      redFlags.push("finančna/privatna tveganja");

    const summary = (() => {
      const first = text.trim().split(/\n/).slice(-8).join(" ").slice(0, 240);
      return first + (text.length > 240 ? "…" : "");
    })();

    return { metrics, signals, vibe, redFlags, summary };
  }, [text]);
}

function craftReply({
  transcript,
  tone,
  goal,
  length,
  boundaries,
  askFollowups,
}) {
  const { signals, vibe } = simpleAnalyze(transcript);
  const politeOpeners = {
    neutral: ["Hvala za sporočilo.", "Oglasim se na kratko:"],
    warm: [
      "Hvala, da si delil/a. Razumem, kako se počutiš.",
      "Najprej – hvala za iskrenost.",
    ],
    confident: ["Najprej jasno povem:", "Da ne izgubljava časa:"],
    apologetic: [
      "Oprosti, če sem kaj narobe razumel.",
      "Se opravičujem za zamudo.",
    ],
    funny: [
      "Ok, drama off, espresso on ☕:",
      "Če bi bil to tenis, bi zdaj šla na tie-break:",
    ],
  };

  const opener = (politeOpeners[tone] || politeOpeners.neutral)[0];

  const blocks = [];
  // Empathy / acknowledgment
  if (vibe === "jeza / konflikt")
    blocks.push(
      "Razumem, da te je to zmotilo in da si jezen/jezna. Rad bi to uredil konstruktivno."
    );
  else if (vibe === "žalost / občutljivost")
    blocks.push(
      "Vidim, da ti to veliko pomeni in da te je prizadelo. Vzemi moj odgovor kot iskren poskus razumevanja."
    );
  else if (vibe === "nujno")
    blocks.push(
      "Videl sem, da je stvar nujna, zato odgovarjam naravnost in jedrnato."
    );

  // Goal-driven body
  switch (goal) {
    case "Pomiriti situacijo":
      blocks.push(
        "Predlagam, da narediva korak nazaj: jaz na kratko razložim svoj pogled, ti pa poveš, če sem kaj zgrešil."
      );
      break;
    case "Dogovoriti termin":
      blocks.push(
        "Lahko izbereva termin: danes po 17h ali jutri med 9–12? Če ti ne ustreza, predlagaj drugega."
      );
      break;
    case "Postaviti meje":
      blocks.push(
        "Da bo jasno: spoštujem te, a potrebujem jasne meje – ne sprejemam žaljivk in pritiskov. Če nadaljujeva, naj bo spoštljivo."
      );
      break;
    case "Vprasati za pojasnila":
      blocks.push(
        "Lahko prosim poveš, kaj točno te je najbolj zmotilo/zanima? Pomagale bi mi 2–3 točke."
      );
      break;
    case "Prodajni odziv":
      blocks.push(
        "Če povzamem ponudbo v eni vrstici: dobaviš X, mi zagotovimo Y v roku Z. Če želiš, pošljem kratek PDF s cenami."
      );
      break;
    case "Flirt / simpatičen odgovor":
      blocks.push(
        "Všeč mi je tvoj slog. Če si za, kdaj kava/čaj? Lahko čisto na izi, brez pričakovanj."
      );
      break;
    case "Prekinitev stika (vljudno)":
      blocks.push(
        "Da ne bova ovinkarila: mislim, da je bolje, da vsak gre svojo pot. Želim ti vse dobro."
      );
      break;
    default:
      blocks.push(
        "Povej, kaj je zate tukaj najpomembnejše, pa se temu prilagodim."
      );
  }

  if (boundaries) blocks.push(boundaries.trim());
  if (askFollowups)
    blocks.push("Če sem kaj spregledal, povej prosim v 1–2 stavkih.");

  let reply = `${opener} ${blocks.join(" ")}`;

  if (length === "short") {
    reply = reply.split(/\.\s+/).slice(0, 2).join(". ") + ".";
  } else if (length === "medium") {
    reply = reply.split(/\.\s+/).slice(0, 4).join(". ") + ".";
  }
  return reply;
}

function simpleAnalyze(text) {
  const { signals, vibe, redFlags, summary } = (function () {
    const lower = text.toLowerCase();
    const anger =
      /(idiot|butelj|kurc|zajeb|jezen|grd|ignoriraš|kriv|sovražim)/i.test(lower)
        ? 2
        : 0;
    const sadness = /(žal|pogrešam|sam|osamljen|jok|srce|razhod|ločitev)/i.test(
      lower
    )
      ? 1
      : 0;
    const affection = /(ljubim|rad te imam|objem|poljub|draga|dragi)/i.test(
      lower
    )
      ? 1
      : 0;
    const urgency = /(nujno|takoj|zadnji rok|danes)/i.test(lower) ? 1 : 0;
    let v = "nevtralno";
    if (anger >= 2) v = "jeza / konflikt";
    else if (sadness) v = "žalost / občutljivost";
    else if (affection) v = "naklonjenost";
    else if (urgency) v = "nujno";
    const rf = [];
    if (anger >= 2) rf.push("konfliktni jezik");
    if (/\b(iban|geslo|pin|kartica|nakazilo|posodi)\b/i.test(lower))
      rf.push("finančno tveganje");
    if (text.length > 2000) rf.push("predolgo – uporabi povzetek");
    const sum =
      text.trim().split(/\n/).slice(-6).join(" ").slice(0, 220) +
      (text.length > 220 ? "…" : "");
    return {
      signals: { anger, sadness, affection, urgency },
      vibe: v,
      redFlags: rf,
      summary: sum,
    };
  })();
  return { signals, vibe, redFlags, summary };
}

// === Placeholder za pravo AI integracijo ===
// Odkomentiraj in poveži z backendom (npr. /api/generate)
async function callOpenAI({ transcript, tone, goal, length, boundaries }) {
  // Primer requesta:
  // const res = await fetch('/api/generate', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ transcript, tone, goal, length, boundaries })});
  // const data = await res.json();
  // return data.reply;
  return null; // v tem MVP-ju nič ne kličemo; uporabljamo craftReply()
}

export default function App() {
  const [transcript, setTranscript] = useState("");
  const [tone, setTone] = useState("warm");
  const [goal, setGoal] = useState(GOALS[0]);
  const [length, setLength] = useState("short");
  const [boundaries, setBoundaries] = useState("");
  const [askFollowups, setAskFollowups] = useState(true);
  const [reply, setReply] = useState("");
  const analysis = useHeuristicAnalysis(transcript);

  async function generate() {
    // 1) poskusi z API (če ga dodaš)
    const api = await callOpenAI({
      transcript,
      tone,
      goal,
      length,
      boundaries,
    });
    // 2) fallback lokalno
    const r =
      api ||
      craftReply({ transcript, tone, goal, length, boundaries, askFollowups });
    setReply(r);
  }

  function exportAnalysis() {
    const txt = `AI Partner – analiza\n\nPovzetek: ${analysis.summary}\nVibe: ${
      analysis.vibe
    }\nSignali: ${JSON.stringify(analysis.signals)}\nOpozorila: ${
      analysis.redFlags.join(", ") || "—"
    }\n\nPredlog odgovora:\n${reply || "(najprej generiraj)"}\n`;
    download("ai-partner-analiza.txt", txt);
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">
              AI Partner – Klepetalnik Analitik
            </h1>
            <p className="text-gray-600">
              Prilepi pogovor, izberi cilj in ton, dobi predlog odgovora +
              analizo. (MVP brez strežnika)
            </p>
          </div>
        </header>

        <section className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-white rounded-2xl shadow p-4">
            <label className="text-sm font-medium">
              Pogovor / sporočila (prilepi):
            </label>
            <textarea
              className="mt-2 w-full h-64 rounded-xl border p-3"
              placeholder={`Prilepi zadnjih 10–20 sporočil…`}
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
            />

            <div className="grid md:grid-cols-3 gap-3 mt-4">
              <div>
                <label className="text-sm font-medium">Ton</label>
                <select
                  className="w-full rounded-xl border p-2 mt-1"
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                >
                  {TONES.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Dolžina</label>
                <select
                  className="w-full rounded-xl border p-2 mt-1"
                  value={length}
                  onChange={(e) => setLength(e.target.value)}
                >
                  {LENGTHS.map((l) => (
                    <option key={l.key} value={l.key}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Cilj odgovora</label>
                <select
                  className="w-full rounded-xl border p-2 mt-1"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                >
                  {GOALS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label className="block mt-4 text-sm font-medium">
              Dodatne meje / pogoji (neobvezno)
            </label>
            <input
              className="w-full rounded-xl border p-2 mt-1"
              placeholder="npr. 'Ne odgovarjam med 22:00–8:00' ali 'Ne sprejemam žaljivega tona'"
              value={boundaries}
              onChange={(e) => setBoundaries(e.target.value)}
            />

            <div className="flex items-center gap-2 mt-3">
              <input
                id="followups"
                type="checkbox"
                checked={askFollowups}
                onChange={(e) => setAskFollowups(e.target.checked)}
              />
              <label htmlFor="followups" className="text-sm">
                Dodaj vljudno prošnjo za 1–2 dodatni info
              </label>
            </div>

            <div className="flex flex-wrap gap-3 mt-4">
              <button
                onClick={generate}
                className="px-4 py-2 rounded-xl bg-black text-white shadow"
              >
                Generiraj odgovor
              </button>
              <button
                onClick={() => {
                  setTranscript("");
                  setReply("");
                }}
                className="px-4 py-2 rounded-xl bg-gray-200"
              >
                Počisti
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow p-4">
            <h2 className="text-lg font-semibold">Analiza</h2>
            <ul className="text-sm mt-2 space-y-1">
              <li>
                <span className="font-medium">Povzetek:</span>{" "}
                {analysis.summary || "—"}
              </li>
              <li>
                <span className="font-medium">Vibe:</span> {analysis.vibe}
              </li>
              <li>
                <span className="font-medium">Signali:</span> anger{" "}
                {analysis.signals.anger}, sadness {analysis.signals.sadness},
                affection {analysis.signals.affection}, urgency{" "}
                {analysis.signals.urgency}
              </li>
              <li>
                <span className="font-medium">Opozorila:</span>{" "}
                {analysis.redFlags.length ? analysis.redFlags.join(", ") : "—"}
              </li>
            </ul>
            <button
              onClick={exportAnalysis}
              className="mt-3 px-3 py-2 rounded-xl bg-gray-900 text-white"
            >
              Izvozi analizo (.txt)
            </button>
          </div>
        </section>

        <section className="bg-white rounded-2xl shadow p-4">
          <h2 className="text-lg font-semibold">Predlagan odgovor</h2>
          <textarea
            readOnly
            className="mt-2 w-full h-40 rounded-xl border p-3"
            value={reply}
            placeholder="Klikni 'Generiraj odgovor'"
          />
          <div className="flex gap-3 mt-3">
            <button
              onClick={() => copy(reply)}
              className="px-4 py-2 rounded-xl bg-blue-600 text-white"
            >
              Kopiraj
            </button>
            <button
              onClick={() =>
                setReply((prev) =>
                  prev
                    ? prev + "\n\nDodatek: lahko še kaj pojasnim v 1–2 stavkih?"
                    : prev
                )
              }
              className="px-4 py-2 rounded-xl bg-gray-200"
            >
              Dodaj vljudno vprašanje
            </button>
          </div>
        </section>

        <footer className="text-xs text-gray-500">
          Naslednje nadgradnje: pravi GPT klic (backend), predloge za različne
          kontekste (posel/romantika/prijatelji), varnostni filter, večjezičnost
          (SLO/HR/EN/IT), zgodovina in shranjevanje, deljenje linka do odgovora.
        </footer>
      </div>
    </div>
  );
}
