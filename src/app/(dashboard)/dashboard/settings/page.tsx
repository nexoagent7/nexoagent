import { Settings } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Configurações</h1>
        <p className="mt-1 text-sm text-foreground-secondary">
          Gerencie as configurações da sua conta
        </p>
      </div>

      <Card>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Settings className="h-10 w-10 text-foreground-secondary/30" />
            <p className="mt-3 text-sm font-medium text-foreground-secondary">
              Em breve
            </p>
            <p className="mt-1 text-xs text-foreground-secondary">
              As configurações de conta estarão disponíveis na próxima versão
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
