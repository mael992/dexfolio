import { House } from 'lucide-react'
import { Link } from 'react-router'
import { CircleQuestionMark } from 'lucide-react'
import { buttonClass, EmptyState } from '../components/ui'

export default function NotFoundPage() {
  return (
    <EmptyState
      icon={CircleQuestionMark}
      title="Page introuvable"
      className="mt-10"
      action={
        <Link to="/" className={buttonClass('primary')}>
          <House className="size-4" /> Retour à l’accueil
        </Link>
      }
    >
      Ce Pokémon sauvage s’est enfui… La page demandée n’existe pas.
    </EmptyState>
  )
}
