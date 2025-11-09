import { Home, BookOpen, Menu, X } from 'lucide-react';
import { useState } from 'react';

interface BottomNavigationProps {
  currentView: 'dashboard' | 'courses' | 'calendar';
  onViewChange: (view: 'dashboard' | 'courses' | 'calendar') => void;
}

export function BottomNavigation({ currentView, onViewChange }: BottomNavigationProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const navItems = [
    { id: 'dashboard' as const, icon: Home, label: 'Start' },
    { id: 'courses' as const, icon: BookOpen, label: 'Kurse' },
  ];

  const handleNavClick = (view: 'dashboard' | 'courses' | 'calendar') => {
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
        <div className="p-4 space-y-1 min-w-[200px]">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive 
                    ? 'text-blue-600 bg-blue-50' 
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Burger Menu Bubble - Bottom Left */}
      <button
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        className={`fixed bottom-6 left-6 z-[70] w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 ${
          isMenuOpen 
            ? 'bg-blue-600 text-white rotate-90' 
            : 'bg-white text-gray-600 hover:bg-gray-50'
        }`}
      >
        {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>
    </>
  );
}
