import React from 'react';
import { ParkingProvider, useParking } from './context/ParkingContext';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { ToastContainer } from './components/common/ToastContainer';
import { Overview } from './pages/Overview';
import { LiveParking } from './pages/LiveParking';
import { Analytics } from './pages/Analytics';
import { ParkingHistory } from './pages/ParkingHistory';
import { DeviceHealth } from './pages/DeviceHealth';
import { DemoCenter } from './pages/DemoCenter';
import { Settings } from './pages/Settings';

const MainContent: React.FC = () => {
  const { activeTab } = useParking();

  const renderActivePage = () => {
    switch (activeTab) {
      case 'overview':
        return <Overview />;
      case 'live':
        return <LiveParking />;
      case 'analytics':
        return <Analytics />;
      case 'history':
        return <ParkingHistory />;
      case 'health':
        return <DeviceHealth />;
      case 'demo':
        return <DemoCenter />;
      case 'settings':
        return <Settings />;
      default:
        return <Overview />;
    }
  };

  return (
    <div className="flex min-h-screen bg-[#090d16] text-slate-100">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 p-8 max-w-7xl w-full mx-auto">
          {renderActivePage()}
        </main>
      </div>
      <ToastContainer />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <ParkingProvider>
      <MainContent />
    </ParkingProvider>
  );
};

export default App;
