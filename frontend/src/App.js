import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Toaster } from "./components/ui/sonner";
import Dashboard from "./pages/Dashboard";
import Editor from "./pages/Editor";
import Viewer from "./pages/Viewer";
import Library from "./pages/Library";
import LibraryEditor from "./pages/LibraryEditor";
import { Login, Signup } from "./pages/Auth";
import { Terms, Privacy } from "./pages/Legal";
import { AuthProvider, useAuth } from "./lib/auth";

function RequireAuth({ children }) {
  const { account } = useAuth();
  if (account === undefined) return <div className="min-h-screen bg-[#0B0F17] grid place-items-center"><Loader2 className="w-6 h-6 text-slate-500 animate-spin" /></div>;
  if (!account) return <Navigate to="/login" replace />;
  return children;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RequireAuth><Dashboard /></RequireAuth>} />
          <Route path="/edit/:id" element={<RequireAuth><Editor /></RequireAuth>} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/libraries/:id" element={<RequireAuth><LibraryEditor /></RequireAuth>} />
          <Route path="/library/:slug" element={<Library />} />
          <Route path="/embed/library/:slug" element={<Library embed />} />
          <Route path="/view/:id" element={<Viewer />} />
          <Route path="/embed/:id" element={<Viewer embed />} />
        </Routes>
        <Toaster position="bottom-right" theme="dark" />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
