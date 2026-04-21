import { Upload, FileText, FileCheck, FilePen, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Documentos() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Documentos</h1>
          <p className="text-sm text-gray-500">Gestão de documentos por processo</p>
        </div>
        <Button disabled>
          <Upload className="w-4 h-4 mr-2" /> Upload documento
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Petições', icon: FileText, color: 'text-blue-500', bg: 'bg-blue-50' },
          { label: 'Contratos', icon: FileCheck, color: 'text-green-500', bg: 'bg-green-50' },
          { label: 'Procurações', icon: FilePen, color: 'text-purple-500', bg: 'bg-purple-50' },
        ].map(({ label, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white rounded-xl border shadow-sm p-5 flex items-center gap-4">
            <div className={`p-3 rounded-lg ${bg}`}>
              <Icon className={`w-6 h-6 ${color}`} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">0</p>
              <p className="text-sm text-gray-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border shadow-sm p-12 flex flex-col items-center justify-center text-center">
        <FolderOpen className="w-16 h-16 text-gray-200 mb-4" />
        <h3 className="text-lg font-semibold text-gray-700 mb-2">
          Módulo em desenvolvimento
        </h3>
        <p className="text-sm text-gray-400 max-w-md">
          O módulo de documentos por processo está sendo desenvolvido.
          Em breve você poderá fazer upload, organizar e visualizar documentos
          diretamente vinculados a cada processo jurídico.
        </p>
      </div>
    </div>
  );
}
