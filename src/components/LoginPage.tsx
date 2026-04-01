import { useState } from "react";
import { motion } from "framer-motion";
import { User, Lock, Eye, EyeOff, LogIn, Mail } from "lucide-react";
import logoImg from "@/assets/logo.png";
import { db, auth, googleProvider, ref, set, get, signInWithPopup } from "@/lib/firebase";
import { toast } from "sonner";
import { useUiConfig } from "@/hooks/useUiConfig";

interface LoginPageProps {
  onLogin: (userId: string) => void;
}

const LoginPage = ({ onLogin }: LoginPageProps) => {
  const uiConfig = useUiConfig();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // ... keep existing code (handleGoogleSignIn function lines 21-84)
  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      const gEmail = user.email || "";
      const gName = user.displayName || gEmail.split("@")[0];
      const gPhoto = user.photoURL || "";
      const commaKey = gEmail.toLowerCase().replace(/\./g, ",").replace(/[^a-z0-9@,_-]/g, "_");

      let existingData: any = null;
      const keysToTry = [commaKey, gEmail.toLowerCase().replace(/[^a-z0-9]/g, "_")];
      const nodesToSearch = ['appUsers', 'users'];

      for (const node of nodesToSearch) {
        if (existingData) break;
        for (const key of keysToTry) {
          try {
            const snap = await get(ref(db, `${node}/${key}`));
            if (snap.exists()) {
              existingData = snap.val();
              break;
            }
          } catch (e) {}
        }
      }

      const uid = existingData?.id || "user_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9);

      await set(ref(db, `appUsers/${commaKey}`), {
        id: uid, name: gName, email: gEmail, googleAuth: true,
        createdAt: existingData?.createdAt || Date.now(),
      });

      try {
        await set(ref(db, `users/${commaKey}`), {
          id: uid, name: gName, email: gEmail, online: true,
          lastSeen: Date.now(), createdAt: existingData?.createdAt || Date.now(),
        });
      } catch (e) {}

      localStorage.setItem("rsanime_user", JSON.stringify({ id: uid, dbKey: commaKey, name: gName, email: gEmail }));
      localStorage.setItem("rs_display_name", gName);
      if (gPhoto) { localStorage.setItem("rs_profile_photo", gPhoto); }
      toast.success(`Welcome, ${gName}!`);
      onLogin(uid);
    } catch (err: any) {
      if (err.code !== "auth/popup-closed-by-user") {
        toast.error("Google sign-in failed: " + err.message);
      }
    }
    setLoading(false);
  };

  // ... keep existing code (handleSubmit function lines 87-230)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const loginInput = isRegister ? email.trim() : name.trim();
    if (!loginInput || !password.trim()) { toast.error("Please fill in all fields"); return; }
    if (isRegister && !name.trim()) { toast.error("Please enter a username"); return; }
    if (password.length < 4) { toast.error("Password must be at least 4 characters"); return; }

    setLoading(true);
    try {
      const input = loginInput;
      const inputLower = input.toLowerCase();
      const commaKey = inputLower.replace(/\./g, ",").replace(/[^a-z0-9@,_-]/g, "_");
      const legacyKey = inputLower.replace(/[^a-z0-9]/g, "_");
      const dotKey = inputLower.replace(/[^a-z0-9@._-]/g, "_");
      const nodesToSearch = ['appUsers', 'users'];
      const keysToTry = [...new Set([commaKey, legacyKey, dotKey])];
      const allMatches: any[] = [];

      for (const node of nodesToSearch) {
        for (const keyAttempt of keysToTry) {
          try {
            const kRef = ref(db, `${node}/${keyAttempt}`);
            const kSnap = await get(kRef);
            if (kSnap.exists()) { allMatches.push({ node, key: keyAttempt, data: kSnap.val() }); }
          } catch (e: any) {}
        }
      }

      if (allMatches.length === 0 && !isRegister) {
        for (const node of nodesToSearch) {
          try {
            const allRef = ref(db, node);
            const allSnap = await get(allRef);
            if (allSnap.exists()) {
              const allData = allSnap.val();
              for (const key of Object.keys(allData)) {
                const u = allData[key];
                if (u && typeof u === 'object') {
                  const nameMatch = u.name && u.name.toLowerCase() === inputLower;
                  const emailMatch = u.email && u.email.toLowerCase() === inputLower;
                  if (nameMatch || emailMatch) { allMatches.push({ node, key, data: u }); }
                }
              }
            }
          } catch (e: any) {}
        }
      }

      const withPassword = allMatches.find(m => m.data?.password);
      const withId = allMatches.find(m => m.data?.id);
      const anyMatch = allMatches[0];
      let finalUserData: any = null;
      let finalUserId: string = "";

      if (anyMatch) {
        finalUserData = { ...anyMatch.data };
        if (withPassword) finalUserData.password = withPassword.data.password;
        if (withId) finalUserData.id = withId.data.id;
        if (!finalUserData.name && anyMatch.data.name) finalUserData.name = anyMatch.data.name;
        finalUserId = finalUserData.id || "";
      }

      if (isRegister) {
        if (anyMatch) { toast.error("This email/username is already taken!"); setLoading(false); return; }
        const emailKey = email.trim().toLowerCase().replace(/\./g, ",").replace(/[^a-z0-9@,_-]/g, "_");
        const userId = "user_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9);
        await set(ref(db, `appUsers/${emailKey}`), {
          id: userId, name: name.trim(), email: email.trim(), password: password, createdAt: Date.now(),
        });
        await set(ref(db, `users/${emailKey}`), {
          name: name.trim(), email: email.trim(), createdAt: Date.now(), online: true, lastSeen: Date.now(), id: userId,
        });
        localStorage.setItem("rsanime_user", JSON.stringify({ id: userId, dbKey: emailKey, name: name.trim(), email: email.trim() }));
        localStorage.setItem("rs_display_name", name.trim());
        toast.success("Account created successfully!");
        onLogin(userId);
      } else {
        if (!anyMatch) { toast.error("User not found!"); setLoading(false); return; }
        if (finalUserData.password && finalUserData.password !== password) { toast.error("Wrong password!"); setLoading(false); return; }
        if (!finalUserData.password) {
          try {
            await set(ref(db, `appUsers/${commaKey}`), {
              id: finalUserId || commaKey, name: finalUserData.name || input,
              password: password, createdAt: finalUserData.createdAt || Date.now(),
            });
          } catch (e) {}
        }
        const displayName = finalUserData.name || input;
        const uid = finalUserId || commaKey;
        const loginEmail = finalUserData.email || (input.includes("@") ? input : "");
        const dbKey = allMatches.find(m => m.node === "users")?.key || commaKey;
        localStorage.setItem("rsanime_user", JSON.stringify({ id: uid, dbKey, name: displayName, email: loginEmail }));
        localStorage.setItem("rs_display_name", displayName);
        try {
          await set(ref(db, `users/${uid}/online`), true);
          await set(ref(db, `users/${uid}/lastSeen`), Date.now());
        } catch (e) {}
        toast.success(`Welcome back, ${displayName}!`);
        onLogin(uid);
      }
    } catch (err: any) { toast.error("Error: " + err.message); }
    setLoading(false);
  };

  return (
    <motion.div
      className="fixed inset-0 z-[9999] bg-background flex flex-col items-center justify-center px-6"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-primary/5 blur-[100px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-accent/5 blur-[100px]" />
      </div>

      <motion.div
        className="relative z-10 w-full max-w-[340px]"
        initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }}
      >
        <div className="text-center mb-8">
          <img src={uiConfig.appLogo || logoImg} alt={uiConfig.appName} className="w-16 h-16 mx-auto mb-4 rounded-2xl object-contain shadow-[0_10px_40px_hsla(170,75%,45%,0.3)]" />
          <h1 className="text-3xl font-extrabold text-primary text-glow break-words">{uiConfig.loginTitle || uiConfig.appName}</h1>
          <p className="text-xs text-muted-foreground mt-1 break-words">{uiConfig.loginSubtitle}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {isRegister && (
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} maxLength={100}
                className="w-full py-3 pl-10 pr-4 rounded-xl bg-foreground/10 border border-foreground/10 text-foreground text-sm focus:border-primary focus:outline-none focus:shadow-[0_0_20px_hsla(170,75%,45%,0.3)] transition-all placeholder:text-muted-foreground" />
            </div>
          )}
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input type="text" placeholder={isRegister ? "Username" : "Email or Username"} value={name} onChange={e => setName(e.target.value)} maxLength={100}
              className="w-full py-3 pl-10 pr-4 rounded-xl bg-foreground/10 border border-foreground/10 text-foreground text-sm focus:border-primary focus:outline-none focus:shadow-[0_0_20px_hsla(170,75%,45%,0.3)] transition-all placeholder:text-muted-foreground" />
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input type={showPassword ? "text" : "password"} placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full py-3 pl-10 pr-10 rounded-xl bg-foreground/10 border border-foreground/10 text-foreground text-sm focus:border-primary focus:outline-none focus:shadow-[0_0_20px_hsla(170,75%,45%,0.3)] transition-all placeholder:text-muted-foreground" />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2">
              {showPassword ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
            </button>
          </div>
          <button type="submit" disabled={loading}
            className="w-full py-3 rounded-xl gradient-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 btn-glow disabled:opacity-50 transition-all">
            {loading ? <span className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" /> : <><LogIn className="w-4 h-4" /> {isRegister ? "Create Account" : "Login"}</>}
          </button>
        </form>

        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-foreground/10" />
          <span className="text-xs text-muted-foreground">or</span>
          <div className="flex-1 h-px bg-foreground/10" />
        </div>

        <button onClick={handleGoogleSignIn} disabled={loading}
          className="w-full py-3 rounded-xl bg-foreground/10 border border-foreground/10 text-foreground font-medium text-sm flex items-center justify-center gap-3 hover:bg-foreground/15 disabled:opacity-50 transition-all">
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>

        <p className="text-center text-xs text-muted-foreground mt-5">
          {isRegister ? "Already have an account?" : "Don't have an account?"}{" "}
          <button onClick={() => setIsRegister(!isRegister)} className="text-primary font-semibold hover:underline">
            {isRegister ? "Login" : "Register"}
          </button>
        </p>
        {!isRegister && (
          <p className="text-center text-xs mt-2">
            <a href={uiConfig.contactLink || "https://t.me/NEXTGEN_CINEMA"} target="_blank" rel="noopener noreferrer" className="text-primary/70 hover:text-primary hover:underline">
              Forgot Password? Contact Owner
            </a>
          </p>
        )}
      </motion.div>
    </motion.div>
  );
};

export default LoginPage;
