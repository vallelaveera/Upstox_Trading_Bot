import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import Simulator from "@/pages/Simulator";
import LiveTrading from "@/pages/LiveTrading";
import Chat from "@/pages/Chat";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Simulator />} />
          <Route path="/live" element={<LiveTrading />} />
          <Route path="/chat" element={<Chat />} />
        </Routes>
      </BrowserRouter>
      <Toaster
        position="bottom-right"
        theme="dark"
        toastOptions={{
          style: {
            background: "#121212",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.1)",
            fontFamily: "Satoshi, sans-serif",
          },
        }}
      />
    </div>
  );
}

export default App;
