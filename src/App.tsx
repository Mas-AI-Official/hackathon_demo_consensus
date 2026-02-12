import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { HKDemoStudio } from './components/demo/HKDemoStudio';

function App() {
    return (
        <HashRouter>
            <Routes>
                <Route path="/" element={<HKDemoStudio />} />
                <Route path="/demo" element={<HKDemoStudio />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </HashRouter>
    );
}

export default App;
