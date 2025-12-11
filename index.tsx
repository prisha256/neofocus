import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";

// ---------------------------------------------------------
// FIREBASE CONFIG (VITE ENV VARS)
// ---------------------------------------------------------

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Runtime globals
let app: any = null;
let auth: any = null;
let db: any = null;
let isFirebaseInitialized = false;

// ---------------------------------------------------------
// SAFE FIREBASE INITIALIZATION
// ---------------------------------------------------------

function initFirebaseOnce() {
  if (typeof window === "undefined") return;

  console.log(
    "FIREBASE KEY (client):",
    import.meta.env.VITE_FIREBASE_API_KEY ? "[present]" : "[missing]"
  );

  if (!import.meta.env.VITE_FIREBASE_API_KEY) {
    console.warn("Firebase API key missing.");
    return;
  }

  if (!getApps().length) {
    const _app = initializeApp(firebaseConfig);
    app = _app;
    auth = getAuth(app);
    db = getFirestore(app);
  } else {
    app = getApps()[0];
    auth = getAuth(app);
    db = getFirestore(app);
  }

  isFirebaseInitialized = true;
}

initFirebaseOnce();

// ---------------------------------------------------------
// UTILITY TYPES
// ---------------------------------------------------------

type View = "timer" | "journal" | "progress";

interface WorkLog {
  id: string;
  timestamp: number;
  durationSeconds: number;
}

interface DailyJournal {
  date: string;
  highlight: string;
  rating: number;
}

interface UserSettings {
  startDate: number;
}

// ---------------------------------------------------------
// HELPERS
// ---------------------------------------------------------

const getTodayKey = () => new Date().toLocaleDateString("en-CA");

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

const formatDuration = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
};

// ---------------------------------------------------------
// STAR RATING COMPONENT
// ---------------------------------------------------------

const StarRating = ({ rating }: { rating: number }) => (
  <div className="flex space-x-1">
    {[1, 2, 3, 4, 5].map((star) => (
      <i
        key={star}
        className={`fas fa-star text-xl ${
          star <= rating ? "text-[#ff10f0]" : "text-[#f0f0f0]"
        }`}
      ></i>
    ))}
  </div>
);

// ---------------------------------------------------------
// SIDEBAR
// ---------------------------------------------------------

const Sidebar = ({
  isOpen,
  currentView,
  setView,
  closeSidebar,
  user,
  handleLogin,
  handleLogout,
}: {
  isOpen: boolean;
  currentView: View;
  setView: (v: View) => void;
  closeSidebar: () => void;
  user: FirebaseUser | null;
  handleLogin: () => void;
  handleLogout: () => void;
}) => {
  const menuItems = [
    { id: "timer", label: "timer", icon: "fa-clock" },
    { id: "journal", label: "end of day", icon: "fa-pen-to-square" },
    { id: "progress", label: "progress", icon: "fa-chart-line" },
  ] as const;

  return (
    <div
      className={`fixed top-0 left-0 h-full bg-[#000] z-40 transition-transform duration-300 border-r border-[#f0f0f0] ${
        isOpen ? "translate-x-0" : "-translate-x-full"
      } w-64 flex flex-col justify-between`}
    >
      <div className="p-6 pt-20">
        <h2 className="text-3xl mb-8 text-[#f0f0f0] font-light">dashboard</h2>
        <nav className="flex flex-col space-y-4">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setView(item.id);
                if (window.innerWidth < 768) closeSidebar();
              }}
              className={`flex items-center space-x-4 p-3 rounded transition-all ${
                currentView === item.id
                  ? "bg-[#ff10f0] text-black"
                  : "text-[#f0f0f0] hover:bg-[#111]"
              }`}
            >
              <i className={`fas ${item.icon} w-6`}></i>
              <span className="text-xl">{item.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Login section */}
      <div className="p-6 border-t border-[#f0f0f0]">
        {user ? (
          <div className="flex flex-col space-y-4">
            <div className="flex items-center space-x-3 text-[#f0f0f0]">
              <div className="w-8 h-8 bg-[#111] border border-[#f0f0f0] rounded-full overflow-hidden flex items-center justify-center">
                {user.photoURL ? (
                  <img src={user.photoURL} className="w-full h-full" />
                ) : (
                  <i className="fas fa-user text-xs"></i>
                )}
              </div>
              <div className="overflow-hidden">
                <p className="text-sm truncate">{user.displayName}</p>
                <p className="text-xs opacity-50 truncate">synced with cloud</p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="w-full border border-[#f0f0f0] text-[#f0f0f0] py-2 hover:bg-[#111]"
            >
              logout
            </button>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-[#f0f0f0] mb-3 text-sm">login to save progress</p>
            <button
              onClick={handleLogin}
              className="w-full bg-[#f0f0f0] text-black py-2 hover:bg-[#e0e0e0]"
            >
              login with google
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------
// TIMER VIEW
// ---------------------------------------------------------

// TimerView - replace your existing TimerView component with this exact block
const TimerView = ({ addWorkLog }: { addWorkLog: (seconds: number) => void }) => {
    const [timeLeft, setTimeLeft] = useState<number>(25 * 60);
    const [isActive, setIsActive] = useState<boolean>(false);
    const [mode, setMode] = useState<"focus" | "short" | "long">("focus");
    const [showMeow, setShowMeow] = useState<boolean>(false);
  
    // single source of truth for durations
    const secondsForMode = (m: "focus" | "short" | "long") =>
      m === "focus" ? 25 * 60 : m === "short" ? 5 * 60 : 15 * 60;
  
    // unified mode setter - sets mode and immediately sets timeLeft to correct seconds
    const setTimerMode = (newMode: "focus" | "short" | "long") => {
      setIsActive(false);
      setShowMeow(false);
      setMode(newMode);
      setTimeLeft(secondsForMode(newMode));
    };
  
    // reset using current mode (safe because we use secondsForMode)
    const resetTimer = () => {
      setIsActive(false);
      setShowMeow(false);
      setTimeLeft(secondsForMode(mode));
    };
  
    // main timer effect
    useEffect(() => {
      let interval: number | null = null;
      if (isActive && timeLeft > 0) {
        interval = window.setInterval(() => {
          setTimeLeft((prev) => prev - 1);
        }, 1000);
      } else if (isActive && timeLeft === 0) {
        // finished
        setIsActive(false);
        setShowMeow(true);
        if (mode === "focus") {
          // record work only for focus sessions
          addWorkLog(secondsForMode("focus"));
          const audio = new Audio(
            "https://actions.google.com/sounds/v1/alarms/beep_short.ogg"
          );
          audio.play().catch(() => {});
        }
      }
      return () => {
        if (interval) clearInterval(interval);
      };
    }, [isActive, timeLeft, mode, addWorkLog]);
  
    const toggleTimer = () => {
      setShowMeow(false);
      setIsActive((s) => !s);
    };
  
    return (
      <div className="flex flex-col items-center justify-evenly h-[calc(100vh-6rem)] p-4 relative overflow-hidden">
        {/* Mode Selectors */}
        <div className="flex space-x-4 z-10">
          {(["focus", "short", "long"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setTimerMode(m)}
              className={`px-6 py-2 text-xl border transition-all ${
                mode === m
                  ? "border-[#ff10f0] bg-[#ff10f0] text-black"
                  : "border-[#f0f0f0] text-[#f0f0f0] hover:border-[#ff10f0] hover:text-[#ff10f0]"
              }`}
            >
              {m === "focus" ? "work" : m === "short" ? "break" : "long break"}
              <span className="ml-2 text-sm text-[#f0f0f0] opacity-60">
                ({Math.floor(secondsForMode(m) / 60)}m)
              </span>
            </button>
          ))}
        </div>
  
        {/* Timer Display */}
        <div className="text-center z-10 relative">
          {showMeow ? (
            <div className="animate-bounce">
              <span className="text-8xl font-black text-[#ff10f0]">meow</span>
            </div>
          ) : (
            <div
              className="text-9xl font-medium text-[#ff10f0] tabular-nums tracking-tight"
              style={{ WebkitTextStroke: "2px #ff10f0" }}
            >
              {`${Math.floor(timeLeft / 60)
                .toString()
                .padStart(2, "0")}:${(timeLeft % 60).toString().padStart(2, "0")}`}
            </div>
          )}
        </div>
  
        {/* Progress Bar (keeps using timeLeft & secondsForMode(mode)) */}
        <div className="w-full max-w-2xl relative h-12 flex items-center justify-center">
          <div className="w-full h-[1px] bg-[#f0f0f0] absolute"></div>
          <div className="absolute top-0 h-full w-full pointer-events-none">
            <div
              className="absolute top-1/2 -mt-4 transition-all duration-1000 ease-linear flex flex-col items-center"
              style={{
                left: `calc(${((secondsForMode(mode) - timeLeft) / secondsForMode(mode)) * 100}% - 20px)`,
              }}
            >
              <i className="fas fa-cat text-4xl text-[#f0f0f0]" style={{ transform: "scaleX(-1)" }}></i>
            </div>
          </div>
        </div>
  
        {/* Controls */}
        <div className="flex space-x-8 z-10">
          <button
            onClick={toggleTimer}
            className="w-20 h-20 rounded-full bg-[#f0f0f0] text-black flex items-center justify-center text-2xl hover:bg-[#ff10f0] hover:scale-105 transition-all"
          >
            <i className={`fas ${isActive ? "fa-pause" : "fa-play"}`}></i>
          </button>
  
          <button
            onClick={resetTimer}
            className="w-20 h-20 rounded-full border border-[#f0f0f0] text-[#f0f0f0] flex items-center justify-center text-xl hover:border-[#ff10f0] hover:text-[#ff10f0] transition-colors"
          >
            <i className="fas fa-redo"></i>
          </button>
        </div>
  
        {/* Manual Entry */}
        <div className="text-center z-10">
          <button
            onClick={() => {
              const mins = prompt("how many minutes did you work?");
              if (mins && !isNaN(parseInt(mins))) {
                addWorkLog(parseInt(mins) * 60);
                alert(`added ${mins} minutes manually.`);
              }
            }}
            className="text-lg text-[#f0f0f0] hover:text-[#ff10f0] transition-colors"
          >
            + add manual log
          </button>
        </div>
      </div>
    );
  };  

// ---------------------------------------------------------
// JOURNAL VIEW
// ---------------------------------------------------------

const JournalView = ({
  secondsWorkedToday,
  daysActive,
  saveEntry,
  existingEntry,
}: {
  secondsWorkedToday: number;
  daysActive: number;
  saveEntry: (highlight: string, rating: number) => void;
  existingEntry: DailyJournal | undefined;
}) => {
  const [highlight, setHighlight] = useState(existingEntry?.highlight || "");
  const [submitted, setSubmitted] = useState(!!existingEntry);

  useEffect(() => {
    if (existingEntry) {
      setHighlight(existingEntry.highlight);
      setSubmitted(true);
    }
  }, [existingEntry]);

  const targetSeconds = daysActive <= 10 ? 4 * 3600 : 5 * 3600;
  const rawRating = (secondsWorkedToday / targetSeconds) * 5;
  const rating = Math.min(Math.round(rawRating), 5);

  const handleSubmit = () => {
    saveEntry(highlight, rating);
    setSubmitted(true);
  };

  if (submitted && existingEntry) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <h2 className="text-4xl text-[#ff10f0] mb-4">day logged</h2>

        <div className="text-8xl mb-6 text-[#f0f0f0] font-black">
          {existingEntry.rating}
          <span className="text-4xl font-light">/5</span>
        </div>

        <StarRating rating={existingEntry.rating} />

        <p className="mt-12 text-[#f0f0f0] max-w-md italic text-2xl font-light">
          "{existingEntry.highlight}"
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto pt-10 p-6">
      <h2 className="text-4xl mb-12 border-l-4 border-[#ff10f0] pl-6">
        end of day
      </h2>

      <div className="grid md:grid-cols-2 gap-6 mb-10">
        <div className="bg-[#050505] p-8 border border-[#f0f0f0]">
          <h3 className="text-lg mb-2">time worked</h3>
          <p className="text-5xl font-light">{formatDuration(secondsWorkedToday)}</p>
        </div>

        <div className="bg-[#050505] p-8 border border-[#f0f0f0]">
          <h3 className="text-lg mb-2">target</h3>
          <p className="text-5xl font-light">{formatDuration(targetSeconds)}</p>
          <p className="text-lg mt-3">
            {daysActive <= 10 ? "beginner (4h)" : "pro (5h)"}
          </p>
        </div>
      </div>

      <textarea
        className="w-full bg-[#0a0a0a] border border-[#f0f0f0] p-6 text-xl h-48 resize-none focus:border-[#ff10f0]"
        placeholder="what did you achieve today?"
        value={highlight}
        onChange={(e) => setHighlight(e.target.value)}
      ></textarea>

      <div className="flex justify-between mt-10 border-t border-[#f0f0f0] pt-8">
        <div>
          <p className="text-lg mb-2">projected rating</p>
          <StarRating rating={rating} />
        </div>

        <button
          onClick={handleSubmit}
          disabled={!highlight.trim()}
          className="bg-[#ff10f0] text-black text-xl py-4 px-12 disabled:opacity-20"
        >
          complete
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------
// PROGRESS VIEW
// ---------------------------------------------------------

const ProgressView = ({ logs }: { logs: WorkLog[] }) => {
  const todayKey = getTodayKey();
  const now = new Date();

  const todayTotal = logs
    .filter((l) => new Date(l.timestamp).toLocaleDateString("en-CA") === todayKey)
    .reduce((a, b) => a + b.durationSeconds, 0);

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const weekTotal = logs
    .filter((l) => l.timestamp >= oneWeekAgo.getTime())
    .reduce((a, b) => a + b.durationSeconds, 0);

  const monthTotal = logs
    .filter((l) => {
      const d = new Date(l.timestamp);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((a, b) => a + b.durationSeconds, 0);

  return (
    <div className="max-w-5xl mx-auto pt-10 p-6">
      <h2 className="text-4xl mb-12 border-l-4 border-[#ff10f0] pl-6">
        progress
      </h2>

      <div className="grid md:grid-cols-3 gap-6">
        {[{ label: "today", val: todayTotal }, { label: "this week", val: weekTotal }, { label: "this month", val: monthTotal }].map((stat) => (
          <div
            key={stat.label}
            className="bg-[#050505] border p-10 hover:border-[#ff10f0]"
          >
            <h3 className="text-xl mb-4">{stat.label}</h3>
            <p className="text-6xl font-light">{formatDuration(stat.val)}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------
// MAIN APP
// ---------------------------------------------------------

const App = () => {
  const [view, setView] = useState<View>("timer");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState<FirebaseUser | null>(null);

  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [journals, setJournals] = useState<DailyJournal[]>([]);
  const [settings, setSettings] = useState<UserSettings>({ startDate: Date.now() });
  const [streak, setStreak] = useState(0);

  // Listen for login
  useEffect(() => {
    if (!isFirebaseInitialized) return;

    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  // Fetch logs + journals when user changes
  useEffect(() => {
    if (!user || !isFirebaseInitialized) {
      setLogs([]);
      setJournals([]);
      setStreak(0);
      return;
    }

    const logsRef = collection(db, "users", user.uid, "logs");
    const unsubLogs = onSnapshot(
      query(logsRef, orderBy("timestamp", "desc")),
      (snap) => setLogs(snap.docs.map((d) => d.data() as WorkLog))
    );

    const journRef = collection(db, "users", user.uid, "journals");
    const unsubJourn = onSnapshot(journRef, (snap) => {
      const arr = snap.docs.map((d) => d.data() as DailyJournal);
      arr.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setJournals(arr);
    });

    const settingsRef = doc(db, "users", user.uid, "settings", "general");
    getDoc(settingsRef).then((s) => {
      if (s.exists()) setSettings(s.data() as UserSettings);
      else setDoc(settingsRef, settings);
    });

    return () => {
      unsubLogs();
      unsubJourn();
    };
  }, [user]);

  // Streak
  useEffect(() => {
    if (journals.length === 0) return setStreak(0);

    let current = 0;
    for (const j of journals) {
      if (j.rating >= 3) current++;
      else break;
    }
    setStreak(current);
  }, [journals]);

  const handleLogin = async () => {
    if (!isFirebaseInitialized) return alert("firebase not initialized.");
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogout = async () => signOut(auth);

  const addWorkLog = async (seconds: number) => {
    if (!user) return alert("Please login.");

    const newLog: WorkLog = {
      id: Date.now() + "",
      timestamp: Date.now(),
      durationSeconds: seconds,
    };

    await setDoc(doc(db, "users", user.uid, "logs", newLog.id), newLog);
  };

  const saveJournalEntry = async (highlight: string, rating: number) => {
    if (!user) return alert("Please login.");

    const today = getTodayKey();
    const entry: DailyJournal = { date: today, highlight, rating };

    await setDoc(doc(db, "users", user.uid, "journals", today), entry);
  };

  const getTodaySeconds = () =>
    logs
      .filter((l) => new Date(l.timestamp).toLocaleDateString("en-CA") === getTodayKey())
      .reduce((a, b) => a + b.durationSeconds, 0);

  const getDaysActive = () => {
    const ms = 1000 * 60 * 60 * 24;
    return Math.floor((Date.now() - settings.startDate) / ms) + 1;
  };

  const getTodayEntry = () => journals.find((j) => j.date === getTodayKey());

  return (
    <div className="min-h-screen bg-black text-[#f0f0f0] selection:bg-[#ff10f0] selection:text-black lowercase">
      {/* NAV */}
      <header className="fixed top-0 left-0 w-full h-16 flex items-center justify-between px-6 z-50 bg-black border-b border-[#f0f0f0]">
        <div className="flex items-center space-x-6">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-[#f0f0f0] hover:text-[#ff10f0]"
          >
            <i className="fas fa-bars text-xl"></i>
          </button>
          <h1 className="text-2xl hidden md:block">
            pomo<span className="text-[#ff10f0]">neon</span>
          </h1>
        </div>

        <div className="flex items-center space-x-3 border-l pl-4">
          <span className="text-lg">streak</span>
          <span className="text-2xl text-[#ff10f0]">{streak}</span>
          <i className="fas fa-fire text-[#ff10f0]"></i>
        </div>
      </header>

      {/* SIDEBAR */}
      <Sidebar
        isOpen={sidebarOpen}
        currentView={view}
        setView={setView}
        closeSidebar={() => setSidebarOpen(false)}
        user={user}
        handleLogin={handleLogin}
        handleLogout={handleLogout}
      />

      {/* MAIN */}
      <main
        className={`pt-24 min-h-screen transition-all duration-300 ${
          sidebarOpen ? "md:ml-64" : ""
        }`}
      >
        {view === "timer" && <TimerView addWorkLog={addWorkLog} />}
        {view === "journal" && (
          <JournalView
            secondsWorkedToday={getTodaySeconds()}
            daysActive={getDaysActive()}
            saveEntry={saveJournalEntry}
            existingEntry={getTodayEntry()}
          />
        )}
        {view === "progress" && <ProgressView logs={logs} />}
      </main>
    </div>
  );
};

createRoot(document.getElementById("root")!).render(<App />);
