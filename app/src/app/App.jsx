import "./App.css";
import { BrowserRouter, Route, Routes } from "react-router";

const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="create" element={<CreateRidePage />} />
          <Route path="join" element={<JoinRidePage />} />
          <Route path="join/:inviteCode" element={<JoinRidePage />} />
          <Route path="rides/:rideId" element={<RidePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

export default App;
