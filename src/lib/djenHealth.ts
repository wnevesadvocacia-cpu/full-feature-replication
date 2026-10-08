export function djenFailureSource(error: string | null): string {
  if (error?.startsWith('COBERTURA INCOMPLETA:') && !/Consulta DJEN|DJEN \d{3}/i.test(error)) {
    return 'Conferência complementar';
  }
  return 'Sincronização';
}