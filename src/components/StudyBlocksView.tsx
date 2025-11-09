import { Plus, Pencil, Trash2, Clock, Calendar } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import type { StudyBlock } from '../types';

interface StudyBlocksViewProps {
  blocks: StudyBlock[];
  onAddBlock: () => void;
  onEditBlock: (block: StudyBlock) => void;
  onDeleteBlock: (blockId: string) => void;
  onToggleBlock: (blockId: string, isActive: boolean) => void;
  weeklyCapacity: number;
}

const DAYS_DE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

export function StudyBlocksView({ 
  blocks, 
  onAddBlock, 
  onEditBlock, 
  onDeleteBlock, 
  onToggleBlock,
  weeklyCapacity 
}: StudyBlocksViewProps) {
  const sortedBlocks = [...blocks].sort((a, b) => {
    if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
    return a.startTime.localeCompare(b.startTime);
  });

  const activeBlocks = blocks.filter(b => b.isActive);
  const totalActiveHours = Math.round(weeklyCapacity / 60 * 10) / 10;

  return (
    <div className="max-w-md mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-gray-900">Lernzeiten</h2>
          <p className="text-gray-600">Definiere deine wöchentlichen Lernblöcke</p>
        </div>
        <Button onClick={onAddBlock} size="sm">
          <Plus className="w-4 h-4 mr-2" />
          Neu
        </Button>
      </div>

      {/* Summary Card */}
      <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white border-0">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-white/80 text-sm">Wöchentliche Kapazität</div>
              <div className="text-2xl">{totalActiveHours}h</div>
            </div>
            <div className="p-3 bg-white/20 rounded-lg">
              <Calendar className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-2 text-white/90 text-sm">
            {activeBlocks.length} aktive {activeBlocks.length === 1 ? 'Block' : 'Blöcke'}
          </div>
        </CardContent>
      </Card>

      {blocks.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Clock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-gray-900 mb-2">Keine Lernblöcke definiert</h3>
            <p className="text-sm text-gray-600 mb-4">
              Erstelle wöchentliche Zeitfenster für dein Studium.
            </p>
            <Button onClick={onAddBlock}>
              <Plus className="w-4 h-4 mr-2" />
              Block erstellen
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sortedBlocks.map(block => (
            <Card key={block.id} className={!block.isActive ? 'opacity-50' : ''}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-gray-900">{DAYS_DE[block.dayOfWeek]}</h3>
                      <Badge variant="outline">
                        {Math.round(block.durationMinutes / 60 * 10) / 10}h
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Clock className="w-4 h-4" />
                      <span>{block.startTime} - {block.endTime}</span>
                    </div>
                  </div>
                  
                    <div className="flex items-center gap-2">
                    <Switch
                      checked={block.isActive}
                      onCheckedChange={(checked: boolean) => onToggleBlock(block.id, checked)}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEditBlock(block)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDeleteBlock(block.id)}
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                    </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
