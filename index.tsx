import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import * as firebaseApp from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  User as FirebaseUser
} from "firebase/auth";
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  onSnapshot, 
  query, 
  orderBy 
} from "firebase/firestore";

// --- Firebase Config ---
// PASTE YOUR FIREBASE KEYS HERE
const firebaseConfig = {
  apiKey: "REPLACE_WITH_YOUR_API_KEY",
  authDomain: "REPLACE_WITH_YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "REPLACE_WITH_YOUR_PROJECT_ID",
  storageBucket: "REPLACE_WITH_YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "REPLACE_WITH_YOUR_SENDER_ID",
  appId: "REPLACE_WITH_YOUR_APP_ID"
};

// Initialize Firebase
let app;
let auth: any;
let db: any;
let isFirebaseInitialized = false;

try {
  // Simple check to ensure placeholder keys are replaced
  if (!firebaseConfig.apiKey.includes("REPLACE")) {
    app = firebaseApp.initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    isFirebaseInitialized = true;
  }
} catch (e) {
  console.error("Firebase init error:", e);
}

// --- Types & Constants ---

type View = "timer" | "journal" | "progress";

interface WorkLog {
  id: string;
  timestamp: number;
  durationSeconds: number;
}

interface DailyJournal {
  date: string; // "YYYY-MM-DD"
  highlight: string;
  rating: number; // 0-5
}

interface UserSettings {
  startDate: number; // Timestamp of first use
}

// --- Helper Functions ---

const getTodayKey = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD

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

// --- Components ---

const StarRating = ({ rating }: { rating: number }) => {
  return (
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
};

const Sidebar = ({
  isOpen,
  currentView,
  setView,
  closeSidebar,
  user,
  handleLogin,
  handleLogout
}: {
  isOpen: boolean;
  currentView: View;
  setView: (v: View) => void;
  closeSidebar: () => void;
  user: FirebaseUser | null;
  handleLogin: () => void;
  handleLogout: () => void;
}) => {
  const menuItems: { id: View; label: string; icon: string }[] = [
    { id: "timer", label: "timer", icon: "fa-clock" },
    { id: "journal", label: "end of day", icon: "fa-pen-to-square" },
    { id: "progress", label: "progress", icon: "fa-chart-line" },
  ];

  return (
    <div
      className={`fixed top-0 left-0 h-full bg-[#000] z-40 transition-transform duration-300 ease-in-out border-r border-[#f0f0f0] ${
        isOpen ? "translate-x-0" : "-translate-x-full"
      } w-64 flex flex-col justify-between`}
    >
      <div className="p-6 pt-20">
        <h2 className="text-3xl mb-8 text-[#f0f0f0] font-light">
          dashboard
        </h2>
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
              <span className="text-xl">
                {item.label}
              </span>
            </button>
          ))}
        </nav>
      </div>
      
      {/* Profile / Login */}
      <div className="p-6 border-t border-[#f0f0f0]">
        {user ? (
             <div className="flex flex-col space-y-4">
                <div className="flex items-center space-x-3 text-[#f0f0f0]">
                    <div className="w-8 h-8 bg-[#111] border border-[#f0f0f0] rounded-full flex items-center justify-center overflow-hidden">
                        {user.photoURL ? (
                            <img src={user.photoURL} alt="p" className="w-full h-full object-cover" />
                        ) : (
                            <i className="fas fa-user text-xs"></i>
                        )}
                    </div>
                    <div className="overflow-hidden">
                        <p className="text-sm leading-none truncate">{user.displayName}</p>
                        <p className="text-xs text-[#f0f0f0] opacity-50 truncate">synced with cloud</p>
                    </div>
                </div>
                <button 
                    onClick={handleLogout}
                    className="w-full border border-[#f0f0f0] text-[#f0f0f0] py-2 hover:bg-[#111] transition-colors"
                >
                    logout
                </button>
             </div>
        ) : (
            <div className="text-center">
                <p className="text-[#f0f0f0] mb-3 text-sm">login to save progress</p>
                <button 
                    onClick={handleLogin}
                    className="w-full bg-[#f0f0f0] text-black py-2 hover:bg-[#e0e0e0] transition-colors"
                >
                    login with google
                </button>
                {!isFirebaseInitialized && <p className="text-xs text-red-500 mt-2">firebase keys missing in code!</p>}
            </div>
        )}
      </div>
    </div>
  );
};

const TimerView = ({ addWorkLog }: { addWorkLog: (seconds: number) => void }) => {
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isActive, setIsActive] = useState(false);
  const [mode, setMode] = useState<"focus" | "short" | "long">("focus");
  const [showMeow, setShowMeow] = useState(false);

  // Constants for calculations
  const totalTime = mode === "focus" ? 25 * 60 : mode === "short" ? 5 * 60 : 15 * 60;
  
  // Calculate progress percentage (0 to 100)
  const progressPercent = ((totalTime - timeLeft) / totalTime) * 100;

  useEffect(() => {
    let interval: any = null;
    if (isActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && isActive) {
      setIsActive(false);
      setShowMeow(true);
      if (mode === "focus") {
        addWorkLog(25 * 60);
        const audio = new Audio("https://actions.google.com/sounds/v1/alarms/beep_short.ogg");
        audio.play().catch(() => {}); 
      }
    }
    return () => clearInterval(interval);
  }, [isActive, timeLeft, mode, addWorkLog]);

  const toggleTimer = () => {
    setShowMeow(false);
    setIsActive(!isActive);
  };

  const resetTimer = () => {
    setIsActive(false);
    setShowMeow(false);
    if (mode === "focus") setTimeLeft(25 * 60);
    else if (mode === "short") setTimeLeft(5 * 60);
    else setTimeLeft(15 * 60);
  };

  const setTimerMode = (newMode: "focus" | "short" | "long") => {
    setIsActive(false);
    setShowMeow(false);
    setMode(newMode);
    if (newMode === "focus") setTimeLeft(25 * 60);
    else if (newMode === "short") setTimeLeft(5 * 60);
    else setTimeLeft(15 * 60);
  };

  return (
    // Changed layout: Fixed height relative to viewport minus header (100vh - 6rem)
    // Used justify-evenly to space elements perfectly without scrolling
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
            <div className="text-9xl font-medium text-[#ff10f0] tabular-nums tracking-tight" style={{ WebkitTextStroke: "2px #ff10f0" }}>
              {formatTime(timeLeft)}
            </div>
        )}
      </div>

      {/* Cat Runner Progress Bar */}
      <div className="w-full max-w-2xl relative h-12 flex items-center justify-center">
          {/* The Track */}
          <div className="w-full h-[1px] bg-[#f0f0f0] absolute"></div>
          
          {/* The Cat */}
          <div 
            className="absolute top-0 h-full w-full pointer-events-none"
          >
            <div 
                className="absolute top-1/2 -mt-4 transition-all duration-1000 ease-linear flex flex-col items-center"
                style={{ 
                    left: `calc(${progressPercent}% - 20px)`, // offset to center cat
                }}
            >
                 <i className="fas fa-cat text-4xl text-[#f0f0f0]" style={{ transform: 'scaleX(-1)' }}></i>
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
  // If we have an existing entry in the DB, show submitted view immediately
  const [submitted, setSubmitted] = useState(!!existingEntry);

  // Update local state if existingEntry loads in late
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
      <div className="flex flex-col items-center justify-center h-full p-6 text-center animate-fade-in">
        <h2 className="text-4xl text-[#ff10f0] mb-4">day logged</h2>
        <div className="text-8xl mb-6 text-[#f0f0f0] font-black">
            {existingEntry.rating}<span className="text-4xl text-[#f0f0f0] font-light">/5</span>
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
      <h2 className="text-4xl mb-12 border-l-4 border-[#ff10f0] pl-6 text-[#f0f0f0]">
        end of day
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        <div className="bg-[#050505] p-8 border border-[#f0f0f0]">
            <h3 className="text-[#f0f0f0] text-lg mb-2">time worked</h3>
            <p className="text-5xl text-[#f0f0f0] font-light">{formatDuration(secondsWorkedToday)}</p>
        </div>
        <div className="bg-[#050505] p-8 border border-[#f0f0f0]">
            <h3 className="text-[#f0f0f0] text-lg mb-2">target</h3>
            <p className="text-5xl text-[#f0f0f0] font-light">{formatDuration(targetSeconds)}</p>
            <p className="text-lg text-[#f0f0f0] mt-3">
                {daysActive <= 10 ? "beginner (4h)" : "pro (5h)"}
            </p>
        </div>
      </div>

      <div className="mb-8">
        <label className="block text-xl text-[#f0f0f0] mb-4">
          highlight of the day
        </label>
        <textarea
          className="w-full bg-[#0a0a0a] border border-[#f0f0f0] p-6 text-[#f0f0f0] text-xl focus:border-[#ff10f0] focus:outline-none transition-colors h-48 resize-none font-sans placeholder:text-[#f0f0f0] placeholder:opacity-30"
          placeholder="what did you achieve today?"
          value={highlight}
          onChange={(e) => setHighlight(e.target.value)}
        ></textarea>
      </div>

      <div className="flex items-center justify-between mt-10 border-t border-[#f0f0f0] pt-8">
        <div>
            <p className="text-lg text-[#f0f0f0] mb-2">projected rating</p>
            <StarRating rating={rating} />
        </div>
        <button
          onClick={handleSubmit}
          disabled={!highlight.trim()}
          className="bg-[#ff10f0] text-black text-xl py-4 px-12 hover:bg-[#f0f0f0] transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
        >
          complete
        </button>
      </div>
    </div>
  );
};

const ProgressView = ({ logs }: { logs: WorkLog[] }) => {
  const todayKey = getTodayKey();
  const now = new Date();
  
  const todayTotal = logs
    .filter((l) => new Date(l.timestamp).toLocaleDateString("en-CA") === todayKey)
    .reduce((acc, curr) => acc + curr.durationSeconds, 0);

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const weekTotal = logs
    .filter((l) => l.timestamp >= oneWeekAgo.getTime())
    .reduce((acc, curr) => acc + curr.durationSeconds, 0);

  const monthTotal = logs
    .filter((l) => {
        const d = new Date(l.timestamp);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((acc, curr) => acc + curr.durationSeconds, 0);

  return (
    <div className="max-w-5xl mx-auto pt-10 p-6">
      <h2 className="text-4xl mb-12 border-l-4 border-[#ff10f0] pl-6 text-[#f0f0f0]">
        progress
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: "today", val: todayTotal },
          { label: "this week", val: weekTotal },
          { label: "this month", val: monthTotal },
        ].map((stat) => (
          <div key={stat.label} className="bg-[#050505] border border-[#f0f0f0] p-10 hover:border-[#ff10f0] transition-colors group">
            <h3 className="text-[#f0f0f0] text-xl mb-4 group-hover:text-[#ff10f0]">{stat.label}</h3>
            <p className="text-6xl text-[#f0f0f0] font-light">{formatDuration(stat.val)}</p>
          </div>
        ))}
      </div>

      <div className="mt-16 border-t border-[#f0f0f0] pt-8">
        <h3 className="text-[#f0f0f0] text-2xl mb-6">integrations</h3>
        <div className="flex items-center space-x-4 opacity-50">
            <div className="p-4 border border-[#f0f0f0] bg-[#050505]">
                <i className="fab fa-google text-[#f0f0f0] text-2xl"></i>
            </div>
            <div>
                <p className="text-[#f0f0f0] text-xl">google tasks</p>
                <p className="text-lg text-[#666]">coming soon</p>
            </div>
        </div>
      </div>
    </div>
  );
};

// --- Main App Component ---

const App = () => {
  const [view, setView] = useState<View>("timer");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // Auth State
  const [user, setUser] = useState<FirebaseUser | null>(null);

  // Data State
  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [journals, setJournals] = useState<DailyJournal[]>([]);
  const [settings, setSettings] = useState<UserSettings>({ startDate: Date.now() });
  const [streak, setStreak] = useState(0);

  // 1. Auth Listener
  useEffect(() => {
    if (!isFirebaseInitialized) return;
    
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // 2. Fetch Data when User Changes
  useEffect(() => {
    if (!user || !isFirebaseInitialized) {
      setLogs([]);
      setJournals([]);
      setStreak(0);
      return;
    }

    // A) Listen to Logs
    const logsRef = collection(db, "users", user.uid, "logs");
    const qLogs = query(logsRef, orderBy("timestamp", "desc"));
    const unsubLogs = onSnapshot(qLogs, (snapshot) => {
      const fetchedLogs = snapshot.docs.map(doc => doc.data() as WorkLog);
      setLogs(fetchedLogs);
    });

    // B) Listen to Journals
    const journalsRef = collection(db, "users", user.uid, "journals");
    const qJournals = query(journalsRef);
    const unsubJournals = onSnapshot(qJournals, (snapshot) => {
      const fetchedJournals = snapshot.docs.map(doc => doc.data() as DailyJournal);
      fetchedJournals.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setJournals(fetchedJournals);
    });

    // C) Get Settings (Start Date)
    const settingsRef = doc(db, "users", user.uid, "settings", "general");
    getDoc(settingsRef).then((docSnap) => {
      if (docSnap.exists()) {
        setSettings(docSnap.data() as UserSettings);
      } else {
        // Init settings
        const initialSettings = { startDate: Date.now() };
        setDoc(settingsRef, initialSettings);
        setSettings(initialSettings);
      }
    });

    return () => {
      unsubLogs();
      unsubJournals();
    };
  }, [user]);

  // 3. Streak Calculation
  useEffect(() => {
    if (journals.length === 0) {
        setStreak(0);
        return;
    }
    
    // Sort logic already handled in fetch, but double check
    const sorted = [...journals].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    let currentStreak = 0;
    
    // Simple logic: consecutive days with >= 3 stars
    // Note: This logic assumes daily usage. For robustness, you'd check dates. 
    // Here we just count top valid entries for simplicity as requested.
    for (let entry of sorted) {
        if (entry.rating >= 3) currentStreak++;
        else break;
    }
    setStreak(currentStreak);
  }, [journals]);

  const handleLogin = async () => {
    if (!isFirebaseInitialized) {
        alert("Firebase keys not set! Please update the code.");
        return;
    }
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleLogout = async () => {
    if (auth) await signOut(auth);
  };

  const addWorkLog = async (seconds: number) => {
    if (!user || !isFirebaseInitialized) {
        alert("Please login to save progress!");
        return;
    }
    
    const newLog: WorkLog = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        durationSeconds: seconds,
    };
    
    // Optimistic UI update not needed due to onSnapshot, but good for UX
    // setLogs([newLog, ...logs]);

    try {
        await setDoc(doc(db, "users", user.uid, "logs", newLog.id), newLog);
    } catch (e) {
        console.error("Error saving log", e);
    }
  };

  const saveJournalEntry = async (highlight: string, rating: number) => {
    if (!user || !isFirebaseInitialized) {
        alert("Please login to save journal!");
        return;
    }
    
    const today = getTodayKey();
    const newEntry: DailyJournal = {
        date: today,
        highlight,
        rating
    };
    
    try {
        // Use date as ID to ensure one entry per day
        await setDoc(doc(db, "users", user.uid, "journals", today), newEntry);
    } catch (e) {
        console.error("Error saving journal", e);
    }
  };

  const getDaysActive = () => {
    const msPerDay = 1000 * 60 * 60 * 24;
    return Math.floor((Date.now() - settings.startDate) / msPerDay) + 1;
  };

  const getTodaySeconds = () => {
    const todayKey = getTodayKey();
    return logs
      .filter((l) => new Date(l.timestamp).toLocaleDateString("en-CA") === todayKey)
      .reduce((acc, curr) => acc + curr.durationSeconds, 0);
  };

  const getTodayEntry = () => journals.find(j => j.date === getTodayKey());

  return (
    <div className="min-h-screen bg-black text-[#f0f0f0] selection:bg-[#ff10f0] selection:text-black lowercase">
      {/* Top Navbar */}
      <header className="fixed top-0 left-0 w-full h-16 flex items-center justify-between px-6 z-50 bg-black border-b border-[#f0f0f0]">
        <div className="flex items-center space-x-6">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-[#f0f0f0] hover:text-[#ff10f0] transition-colors"
          >
            <i className="fas fa-bars text-xl"></i>
          </button>
          <h1 className="text-2xl hidden md:block text-[#f0f0f0] font-normal">
            pomo<span className="text-[#ff10f0]">neon</span>
          </h1>
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-3 px-4 py-2 border-l border-[#f0f0f0]">
            <span className="text-lg text-[#f0f0f0]">streak</span>
            <span className="text-2xl text-[#ff10f0]">{streak}</span>
            <i className="fas fa-fire text-[#ff10f0]"></i>
          </div>
        </div>
      </header>

      <Sidebar
        isOpen={sidebarOpen}
        currentView={view}
        setView={setView}
        closeSidebar={() => setSidebarOpen(false)}
        user={user}
        handleLogin={handleLogin}
        handleLogout={handleLogout}
      />

      {/* Main Content Area */}
      <main className={`pt-24 min-h-screen transition-all duration-300 ${sidebarOpen ? "md:ml-64" : ""}`}>
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

const root = createRoot(document.getElementById("root")!);
root.render(<App />);