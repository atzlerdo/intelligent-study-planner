import { Home, BookOpen, LogOut, Menu, X } from 'lucide-react';
import { useState } from 'react';

interface BottomNavigationProps {
  currentView: 'dashboard' | 'courses';
  onViewChange: (view: 'dashboard' | 'courses') => void;
  onLogout?: () => void;
}

export function BottomNavigation({ currentView, onViewChange, onLogout }: BottomNavigationProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const navItems = [
    { id: 'dashboard' as const, icon: Home, label: 'Start' },
    { id: 'courses' as const, icon: BookOpen, label: 'Kurse' },
  ];

  const handleNavClick = (view: 'dashboard' | 'courses') => {
    onViewChange(view);
    setIsMenuOpen(false);
  };

  return (
    <>
      {/* Overlay */}
      {isMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-[60]"
          onClick={() => setIsMenuOpen(false)}
        />
      )}

      {/* Slide-up Menu */}
      <div 
        className={`fixed bottom-20 left-4 bg-white rounded-2xl shadow-2xl z-[70] transition-all duration-300 ${
          isMenuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
        }`}
      >
        <div className="p-4 space-y-1 min-w-[220px]">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl transition-all text-lg font-bold ${
                  isActive 
                    ? 'bg-gradient-to-r from-gray-900 to-gray-800 text-white hover:from-gray-800 hover:to-gray-700 shadow-lg border-2 border-gray-700' 
                    : 'bg-gradient-to-br from-white to-gray-50 text-gray-900 border-2 border-gray-500 hover:from-gray-50 hover:to-gray-100 hover:border-gray-600 shadow-lg hover:shadow-xl'
                }`}
              >
                <Icon className="w-6 h-6 flex-shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}

          {/* Logout action */}
          <button
            onClick={() => {
              if (onLogout) onLogout();
              setIsMenuOpen(false);
            }}
            className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl transition-all text-lg font-bold bg-gradient-to-br from-white to-gray-50 text-gray-900 border-2 border-gray-500 hover:from-gray-50 hover:to-gray-100 hover:border-gray-600 shadow-lg hover:shadow-xl"
          >
            <LogOut className="w-6 h-6 flex-shrink-0" />
            <span>Abmelden</span>
          </button>
        </div>
      </div>

      {/* Burger Menu Bubble - Bottom Left */}
      <button
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        className={`fixed bottom-6 left-6 z-[70] w-16 h-16 rounded-full shadow-xl flex items-center justify-center transition-all duration-300 ${
          isMenuOpen 
            ? 'bg-gray-900 text-white rotate-90' 
            : 'bg-gray-900 text-white hover:bg-gray-800 border-2 border-gray-700'
        }`}
      >
        {isMenuOpen ? <X className="w-7 h-7" /> : <Menu className="w-7 h-7" />}
      </button>
    </>
  );
}
