import React, { useState, useMemo, useCallback, useEffect } from "react";
import { Lock, Unlock, Shuffle, Check, X, KeyRound, Users, HelpCircle, EyeOff, AlertTriangle } from "lucide-react";

/* ---------- palette (inline styles only — this host doesn't compile
   arbitrary Tailwind values like text-[#xxxxxx], so every color below
   is applied via style={}, never via bracket class names) ---------- */
const C = {
  bg: "#0B1020",
  panel: "#141B33",
  border: "#2A3358",
  borderBright: "#3B4570",
  white: "#FFFFFF",
  white80: "rgba(255,255,255,0.8)",
  white60: "rgba(255,255,255,0.6)",
  white40: "rgba(255,255,255,0.4)",
  rect: "#9FB4FF", // horizontal / vertical arrows
  diag: "#D7E05A", // diagonal arrows
  alice: "#4ADE80",
  aliceDark: "#166534",
  bob: "#8B5CF6",
  bobDark: "#4C1D95",
  key: "#5EEAD4",
  keyDark: "#0D7A6E",
  emerald: "#34D399",
  slate: "#5A6698",
  panelDark: "#2A3358",
  eve: "#FB6A6A",
  eveDark: "#7A2323",
};

const POL = [
  { id: "H", basis: "+", bit: 0, angle: 0, color: C.rect },
  { id: "V", basis: "+", bit: 1, angle: 90, color: C.rect },
  { id: "D", basis: "x", bit: 1, angle: 45, color: C.diag },
  { id: "A", basis: "x", bit: 0, angle: 135, color: C.diag },
];
const N = 10;

const MSG_BITS = [
  0,1,1,1,0,
  1,0,0,0,1,
  1,0,1,0,1,
  1,0,0,0,1,
  0,1,1,1,0,
];

const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];

/* ---------- glyphs ---------- */
function ArrowGlyph({ angle, color, size = 46 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 46 46">
      <g transform={`rotate(${angle} 23 23)`}>
        <line x1="23" y1="8" x2="23" y2="38" stroke={color} strokeWidth="3.5" strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 5px ${color}aa)` }} />
        <polygon points="23,4 18,13 28,13" fill={color} />
        <polygon points="23,42 18,33 28,33" fill={color} />
      </g>
    </svg>
  );
}

function BasisGlyph({ basis, size = 46, active = false }) {
  const color = basis === "+" ? C.rect : C.diag;
  const lines = basis === "+" ? [0, 90] : [45, 135];
  return (
    <svg width={size} height={size} viewBox="0 0 46 46">
      <circle cx="23" cy="23" r="20" fill={active ? `${color}22` : "none"} stroke={color} strokeWidth={active ? 2.5 : 1.5} opacity={active ? 1 : 0.6} />
      {lines.map((a) => (
        <g key={a} transform={`rotate(${a} 23 23)`}>
          <line x1="23" y1="9" x2="23" y2="37" stroke={color} strokeWidth="2.5" strokeLinecap="round" opacity={active ? 1 : 0.6} />
        </g>
      ))}
    </svg>
  );
}

function Dots({ total, current }) {
  return (
    <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 6,
            borderRadius: 999,
            transition: "all .3s",
            width: i < current ? 16 : i === current ? 24 : 6,
            background: i <= current ? C.white : C.border,
            boxShadow: i <= current ? "0 0 6px rgba(255,255,255,0.6)" : "none",
          }}
        />
      ))}
    </div>
  );
}

function Beam({ pulse, color = C.key, reverse = false }) {
  return (
    <div style={{ position: "relative", width: 2, height: "100%", background: "rgba(255,255,255,0.25)" }}>
      {pulse ? (
        <div
          key={pulse}
          style={{
            position: "absolute",
            left: "50%",
            width: 96,
            height: 96,
            transform: "translate(-50%, -50%)",
            borderRadius: "50%",
            background: `radial-gradient(circle, ${color}cc 0%, ${color}77 35%, ${color}00 72%)`,
            filter: "blur(3px)",
            animation: `travel 0.7s ease-in ${reverse ? "reverse" : "normal"} forwards`,
          }}
        />
      ) : null}
    </div>
  );
}

/* ---------- shared bits ---------- */
function Caption({ children, color = C.white80 }) {
  return (
    <div style={{ textAlign: "center", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.15em", color }}>
      {children}
    </div>
  );
}

function Btn({ children, onClick, bg, border, color = C.white, ghost = false }) {
  return (
    <button
      onClick={onClick}
      className="tapBtn"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        margin: ghost ? "0 auto" : undefined,
        padding: ghost ? "10px 20px" : "13px 34px",
        borderRadius: 999,
        fontWeight: 600,
        fontSize: ghost ? 14 : 16,
        color,
        background: bg || "transparent",
        border: `1px solid ${border || "transparent"}`,
      }}
    >
      {children}
    </button>
  );
}

function Handoff({ who, accent, btnBg, onReady }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24, padding: "0 32px", textAlign: "center" }}>
      <Users size={40} color={accent} />
      <Caption>Hand to</Caption>
      <div style={{ fontSize: 30, fontWeight: 700, color: accent, fontFamily: "Space Grotesk, sans-serif" }}>{who}</div>
      <Btn onClick={onReady} bg={btnBg} border={accent}>Ready</Btn>
    </div>
  );
}

/* ---------- main ---------- */
export default function BB84Game() {
  const [phase, setPhase] = useState("welcome");
  const [round, setRound] = useState(0);
  const [alice, setAlice] = useState([]);
  const [bob, setBob] = useState([]);
  const [pulse, setPulse] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [lastBobBasis, setLastBobBasis] = useState(null);
  const [lastAlicePol, setLastAlicePol] = useState(null);
  const [mismatchRed, setMismatchRed] = useState(false);
  const [dropped, setDropped] = useState(() => new Set());
  const [keyRevealCount, setKeyRevealCount] = useState(0);
  const [showWhy, setShowWhy] = useState(false);
  const [historyRatios, setHistoryRatios] = useState([]);
  const [eveMode, setEveMode] = useState(false);
  const [busy, setBusy] = useState(false);

  const reset = useCallback(() => {
    setPhase("welcome");
    setRound(0);
    setAlice([]);
    setBob([]);
    setRevealed(false);
    setMismatchRed(false);
    setDropped(new Set());
    setKeyRevealCount(0);
    setShowWhy(false);
    setEveMode(false);
    setBusy(false);
    setLastAlicePol(null);
    setLastBobBasis(null);
  }, []);

  const restartWithEve = useCallback(() => {
    setPhase("handoff-alice");
    setRound(0);
    setAlice([]);
    setBob([]);
    setRevealed(false);
    setMismatchRed(false);
    setDropped(new Set());
    setKeyRevealCount(0);
    setShowWhy(false);
    setEveMode(true);
    setBusy(false);
    setLastAlicePol(null);
    setLastBobBasis(null);
  }, []);

  const pickAlice = (pol) => {
    if (busy) return;
    setBusy(true);
    const entry = { basis: pol.basis, bit: pol.bit, angle: pol.angle, color: pol.color };
    const next = [...alice, entry];
    setAlice(next);
    setPulse((p) => p + 1);
    setLastAlicePol(pol);
    setTimeout(() => {
      setBusy(false);
      if (next.length >= N) setPhase("handoff-bob");
      else setRound(next.length);
    }, 600);
  };

  const pickBob = (basis) => {
    if (busy) return;
    setBusy(true);
    const a = alice[bob.length];
    let effBasis = a.basis;
    let effBit = a.bit;
    let eve = null;
    if (eveMode) {
      const eveBasis = rand(["+", "x"]);
      const eveMatch = eveBasis === a.basis;
      const eveBit = eveMatch ? a.bit : Math.round(Math.random());
      eve = { basis: eveBasis, bit: eveBit, matchAlice: eveMatch };
      effBasis = eveBasis;
      effBit = eveBit;
    }
    const match = a.basis === basis; // what Alice & Bob publicly compare — unaffected by Eve
    const bit = effBasis === basis ? effBit : Math.round(Math.random()); // what Bob actually measures
    const agree = bit === a.bit; // whether Bob's bit still matches Alice's true bit
    const next = [...bob, { basis, bit, match, agree, eve }];
    setBob(next);
    setPulse((p) => p + 1);
    setLastBobBasis(basis);
    setTimeout(() => {
      setBusy(false);
      if (next.length >= N) setPhase("handoff-together");
      else setRound(next.length);
    }, 600);
  };

  const siftedKey = useMemo(() => bob.filter((b) => b.match).map((b) => b.bit), [bob]);
  const keyBits = siftedKey.length ? siftedKey : [0];
  const cipherGrid = MSG_BITS.map((b, i) => b ^ keyBits[i % keyBits.length]);
  const runningAvgPct = historyRatios.length
    ? Math.round((historyRatios.reduce((s, r) => s + r, 0) / historyRatios.length) * 100)
    : 0;
  const currentCorrectPct = Math.round((bob.filter((b) => b.match && b.agree).length / N) * 100);
  const baselinePct = historyRatios.length ? Math.round(historyRatios[historyRatios.length - 1] * 100) : 50;

  useEffect(() => {
    if (phase !== "together") return;
    setMismatchRed(false);
    setDropped(new Set());
    setKeyRevealCount(0);
    if (!eveMode) {
      setHistoryRatios((prev) => [...prev, bob.filter((b) => b.match && b.agree).length / N]);
    }
    const timers = [];
    timers.push(setTimeout(() => setMismatchRed(true), 500));
    const matchedIdx = bob.map((b, i) => ({ b, i })).filter((o) => o.b.match).map((o) => o.i);
    matchedIdx.forEach((idx, order) => {
      const dropAt = 950 + order * 230;
      timers.push(setTimeout(() => setDropped((prev) => new Set(prev).add(idx)), dropAt));
      timers.push(setTimeout(() => setKeyRevealCount((c) => c + 1), dropAt + 320));
    });
    return () => timers.forEach(clearTimeout);
  }, [phase]);

  let content;

  if (phase === "welcome") {
    content = (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 32, padding: "0 32px", textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <ArrowGlyph angle={0} color={C.rect} />
          <ArrowGlyph angle={90} color={C.rect} />
          <ArrowGlyph angle={45} color={C.diag} />
          <ArrowGlyph angle={135} color={C.diag} />
        </div>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, color: C.white, fontFamily: "Space Grotesk, sans-serif" }}>BB84</div>
          <div style={{ fontSize: 12, color: C.white80, marginTop: 4 }}>Alice sends. Bob measures blind.<br />Compare bases. Share a key.</div>
        </div>
        <Btn onClick={() => setPhase("handoff-alice")} border={C.borderBright}>Begin</Btn>
      </div>
    );
  } else if (phase === "handoff-alice") {
    content = <Handoff who="Alice" accent={C.alice} btnBg={C.aliceDark} onReady={() => setPhase("alice-play")} />;
  } else if (phase === "alice-play") {
    content = (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "24px 24px", gap: 20 }}>
        <Dots total={N} current={round} />
        <Caption color={C.alice}>Alice · photon {round + 1}</Caption>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", alignItems: "center", justifyItems: "center", gap: 2, minHeight: 32 }}>
          {alice.map((a, i) => <ArrowGlyph key={i} angle={a.angle} color={a.color} size={22} />)}
        </div>

        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
          <Beam pulse={pulse} color={C.alice} reverse />
          {lastAlicePol && (
            <div
              key={pulse}
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                marginTop: -23,
                marginLeft: -23,
                animation: "flash 0.7s ease-out forwards",
              }}
            >
              <ArrowGlyph angle={lastAlicePol.angle} color={lastAlicePol.color} size={46} />
            </div>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {POL.map((p) => (
            <button
              key={p.id}
              onClick={() => pickAlice(p)}
              className="tapBtn"
              style={{ aspectRatio: "1", borderRadius: 18, background: C.panel, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <ArrowGlyph angle={p.angle} color={p.color} />
            </button>
          ))}
        </div>
        <Btn onClick={() => pickAlice(rand(POL))} border={C.borderBright} ghost>
          <Shuffle size={16} /> random
        </Btn>
      </div>
    );
  } else if (phase === "handoff-bob") {
    content = <Handoff who="Bob" accent={C.bob} btnBg={C.bobDark} onReady={() => setPhase("bob-play")} />;
  } else if (phase === "bob-play") {
    content = (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "24px 24px", gap: 20 }}>
        <Dots total={N} current={round} />
        <Caption color={C.bob}>Bob · photon {round + 1}</Caption>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", alignItems: "center", justifyItems: "center", gap: 2, minHeight: 32 }}>
          {bob.map((b, i) => (
            <div key={i} style={{ width: 24, height: 24, borderRadius: 999, background: C.panel, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.white, fontFamily: "monospace", fontSize: 12 }}>
              {b.bit}
            </div>
          ))}
        </div>

        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
          <Beam pulse={pulse} color={C.bob} />
          {lastBobBasis && (
            <div
              key={pulse}
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                marginTop: -22,
                marginLeft: -22,
                animation: "flash 0.7s ease-out forwards",
              }}
            >
              <BasisGlyph basis={lastBobBasis} size={44} active />
            </div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          {["+", "x"].map((b) => (
            <button
              key={b}
              onClick={() => pickBob(b)}
              className="tapBtn"
              style={{ aspectRatio: "1", borderRadius: 18, background: C.panel, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <BasisGlyph basis={b} active />
            </button>
          ))}
        </div>
        <Btn onClick={() => pickBob(rand(["+", "x"]))} border={C.borderBright} ghost>
          <Shuffle size={16} /> random
        </Btn>
      </div>
    );
  } else if (phase === "handoff-together") {
    content = (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "28px 24px", gap: 22 }}>
        <div>
          <div style={{ color: C.alice, fontSize: 12, marginBottom: 6, textAlign: "center" }}>Alice sent</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", alignItems: "center", justifyItems: "center", gap: 2 }}>
            {alice.map((a, i) => <BasisGlyph key={i} basis={a.basis} size={26} active />)}
          </div>
        </div>

        <Btn onClick={() => setPhase("together")} border={C.borderBright}>Let's compare</Btn>

        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", alignItems: "center", justifyItems: "center", gap: 2 }}>
            {bob.map((b, i) => <BasisGlyph key={i} basis={b.basis} size={26} active />)}
          </div>
          <div style={{ color: C.bob, fontSize: 12, marginTop: 6, textAlign: "center" }}>Bob picked</div>
        </div>
      </div>
    );
  } else if (phase === "together") {
    content = (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "24px 16px", gap: 16 }}>
        <Caption>Sifting the key</Caption>
        {eveMode && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <EyeOff size={15} color={C.eve} />
            <span style={{ fontSize: 12, color: C.eve, fontWeight: 600 }}>Eve was listening in</span>
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: 3 }}>
            {alice.map((a, i) => {
              const b = bob[i];
              const isDropped = dropped.has(i);
              const tampered = eveMode && b.match && !b.agree;
              return (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                  <ArrowGlyph angle={a.angle} color={a.color} size={24} />
                  {eveMode && b.eve && (
                    <div style={{ background: "rgba(251,106,106,0.28)", borderRadius: 8, padding: 2, lineHeight: 0 }}>
                      <BasisGlyph basis={b.eve.basis} size={18} active />
                    </div>
                  )}
                  <BasisGlyph basis={b.basis} size={22} active />
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 3,
                      transition: "transform .45s ease, opacity .45s ease",
                      transform: isDropped ? "translateY(46px) scale(0.6)" : "translateY(0) scale(1)",
                      opacity: isDropped ? 0 : 1,
                    }}
                  >
                    {!b.match ? (
                      <X size={13} color={mismatchRed ? "#F87171" : C.slate} style={{ transition: "color .4s ease" }} />
                    ) : tampered ? (
                      <AlertTriangle size={13} color={C.eve} />
                    ) : (
                      <Check size={13} color={C.emerald} />
                    )}
                    <div
                      style={{
                        fontSize: 11,
                        fontFamily: "monospace",
                        transition: "color .4s ease",
                        color: !b.match ? (mismatchRed ? "#F87171" : C.white40) : tampered ? C.eve : C.emerald,
                      }}
                    >
                      {b.bit}
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
        <div style={{ borderRadius: 18, background: C.panel, border: `1px solid ${C.border}`, padding: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 12, minHeight: 58 }}>
          <KeyRound size={20} color={C.key} />
          <div style={{ fontFamily: "monospace", fontSize: 18, letterSpacing: "0.3em", color: C.key, display: "flex" }}>
            {siftedKey.length === 0
              ? "—"
              : siftedKey.slice(0, keyRevealCount).map((bit, i) => (
                  <span key={i} style={{ display: "inline-block", animation: "popIn .35s ease-out" }}>{bit}</span>
                ))}
          </div>
        </div>
        <Btn onClick={() => setPhase("final")} border={C.borderBright}>Continue</Btn>

        <button
          onClick={() => setShowWhy((s) => !s)}
          className="tapBtn"
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, margin: "0 auto", background: "transparent", border: "none", color: C.white60 }}
        >
          <HelpCircle size={15} color={C.white60} />
          <span style={{ fontSize: 12 }}>why?</span>
        </button>

        {showWhy && (
          <div style={{ borderRadius: 14, background: C.panel, border: `1px solid ${C.border}`, padding: "12px 14px", fontSize: 12, lineHeight: 1.5, color: C.white80 }}>
            Alice and Bob each announce, out loud, only which <b style={{ color: C.white }}>basis</b> they used per photon — never the bit itself. Where their bases match, they both already hold the same bit, so it's kept. Where bases differ, the bit was a coin flip and is thrown away.
            <br /><br />
            Since Bob guesses one of two bases at random, on average only <b style={{ color: C.white }}>50%</b> of Alice's sent photons survive into the final key.
            <br /><br />
            {eveMode ? (
              currentCorrectPct < baselinePct ? (
                <>
                  Bob's % correct was originally <b style={{ color: C.key }}>{baselinePct}%</b>, but when <span style={{ color: C.eve }}>Eve</span> was listening in, it went down to <b style={{ color: C.eve }}>{currentCorrectPct}%</b>.
                </>
              ) : (
                <>
                  Statistically, when <span style={{ color: C.eve }}>Eve</span> is listening Bob's % correct goes down to <b style={{ color: C.eve }}>25%</b>.
                </>
              )
            ) : (
              <>
                Your running average so far: <b style={{ color: C.key }}>{runningAvgPct}%</b> ({historyRatios.length} game{historyRatios.length === 1 ? "" : "s"} played)
                {currentCorrectPct <= 30 && (
                  <div style={{ marginTop: 8, fontSize: 11, color: C.white60, fontStyle: "italic" }}>
                    *Frankly, your key is too short and Alice wouldn't let this fly in real life, but for the sake of the exercise let's just pretend you hit 50% and move on, okay?
                  </div>
                )}
              </>
            )}
            {eveMode && (
              <>
                <br /><br />
                <span style={{ color: C.eve }}>Eve</span> intercepted every photon and had to guess a basis too. When she guessed wrong, she disturbed the photon before resending it — so even on rounds where Alice and Bob's bases matched, some bits no longer agree. Those flagged rounds are the fingerprint that gives her away.
              </>
            )}
          </div>
        )}
      </div>
    );
  } else if (phase === "final" && eveMode) {
    content = (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 22, padding: "0 32px", textAlign: "center" }}>
        <AlertTriangle size={44} color={C.eve} />
        <div style={{ fontSize: 24, fontWeight: 800, color: C.eve, fontFamily: "Space Grotesk, sans-serif" }}>
          Eavesdropper detected
        </div>
        <div style={{ fontSize: 13, color: C.white80, lineHeight: 1.6 }}>
          Too many bits disagreed on matched-basis rounds.<br />This channel isn't safe.<br />Key discarded.
        </div>
        <Btn onClick={reset} bg={C.panelDark} border={C.eve}>Start again</Btn>
      </div>
    );
  } else if (phase === "final") {
    content = (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28, padding: "0 32px", textAlign: "center" }}>
        <KeyRound size={30} color={C.key} />
        <div style={{ fontFamily: "monospace", fontSize: 26, letterSpacing: "0.35em", color: C.key }}>{siftedKey.join("") || "—"}</div>
        <div style={{ fontSize: 10, color: C.white60, textTransform: "uppercase", letterSpacing: "0.15em" }}>{siftedKey.length} shared bits</div>

        <Btn onClick={() => setRevealed((r) => !r)} border={C.borderBright} ghost>
          {revealed ? <Lock size={16} color={C.emerald} /> : <Unlock size={16} color={C.bob} />}
          <span style={{ fontSize: 14 }}>{revealed ? "sealed" : "seal message"}</span>
        </Btn>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
          {(revealed ? MSG_BITS : cipherGrid).map((b, i) => (
            <div key={i} style={{ width: 24, height: 24, borderRadius: 6, transition: "background .3s", background: b ? (revealed ? C.key : C.bob) : "#1B2244" }} />
          ))}
        </div>

        <Btn onClick={restartWithEve} bg={C.panelDark} border="rgba(255,255,255,0.3)">Did you hear that?</Btn>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", width: "100%", display: "flex", justifyContent: "center", background: `radial-gradient(circle at 50% 0%, #131A38 0%, ${C.bg} 70%)`, overscrollBehavior: "none" }}>
      <style>{`
        @keyframes travel {
          0% { top: 0%; opacity: 0; }
          15% { opacity: 1; }
          85% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        @keyframes flash {
          0% { opacity: 0; transform: scale(0.4); }
          20% { opacity: 1; transform: scale(1.25); }
          35% { transform: scale(1); }
          75% { opacity: 1; }
          100% { opacity: 0; transform: scale(1); }
        }
        @keyframes popIn {
          0% { opacity: 0; transform: scale(0.3); }
          60% { opacity: 1; transform: scale(1.25); }
          100% { opacity: 1; transform: scale(1); }
        }
        .tapBtn { cursor: pointer; transition: transform .15s ease; touch-action: manipulation; -webkit-tap-highlight-color: transparent; user-select: none; }
        .tapBtn:active { transform: scale(0.95); }
        button { touch-action: manipulation; -webkit-tap-highlight-color: transparent; font-family: inherit; user-select: none; }
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
      `}</style>
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          background: "transparent",
          fontFamily: "Inter, sans-serif",
          color: C.white,
        }}
      >
        {content}
      </div>
    </div>
  );
}
