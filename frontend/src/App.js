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

function NotFound() {
  return (
    <div className="min-h-screen bg-[#0a1626] text-white grid place-items-center px-6 text-center" data-testid="not-found">
      <div>
        <p className="text-sm text-white/50">Page not found</p>
        <h1 className="mt-2 text-3xl font-light">This link doesn't lead anywhere.</h1>
        <p className="mt-3 text-white/60">It may have been mistyped, or the page has moved.</p>
        <a href="/" className="inline-block mt-6 h-11 leading-[44px] px-6 rounded-full bg-white text-[#0a1626] text-sm font-medium">Go to the home page</a>
      </div>
    </div>
  );
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
          <Route path="*" element={<NotFound />} />
        </Routes>
        <Toaster position="bottom-right" theme="dark" />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
