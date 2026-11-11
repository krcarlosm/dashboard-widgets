import React, { useCallback, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { Button, IconButton } from './index';
import { MenuItem, MenuNote, MenuPopover } from './MenuPopover';
import { showToast } from './toast';
import { sentNotice, type ActionKind, type ActionTarget, type WidgetActions, type WidgetMessage } from '../sdk/actions';

// ─────────────────────────────────────────────────────────────────────────────
// Botão "Enviar para…": lista as instâncias do canvas que aceitam o conteúdo e
// entrega a(s) mensagem(ns) montada(s) por `build` para o destino escolhido.
// ─────────────────────────────────────────────────────────────────────────────

export interface SendToButtonProps {
  actions: WidgetActions;
  kinds: ActionKind[];
  /** Mensagens para o destino escolhido (pode buscar dados antes, ex.: o texto completo). */
  build: (target: ActionTarget) => WidgetMessage[] | Promise<WidgetMessage[]>;
  /** Rótulo do botão e do menu. */
  label?: string;
  iconOnly?: boolean;
  disabled?: boolean;
  /** Chamado no mousedown, antes de o foco sair (ex.: guardar a seleção do editor). */
  onPrepare?: () => void;
  onSent?: (target: ActionTarget, queued: boolean) => void;
  style?: React.CSSProperties;
}

export function SendToButton({ actions, kinds, build, label = 'Enviar para…', iconOnly, disabled, onPrepare, onSent, style }: SendToButtonProps) {
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<ActionTarget[]>([]);
  const [busy, setBusy] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);

  const toggle = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (open) {
      setOpen(false);
      return;
    }
    setTargets(actions.targets(kinds));
    setOpen(true);
  };

  const sendTo = async (target: ActionTarget) => {
    setOpen(false);
    setBusy(true);
    try {
      const messages = await build(target);
      if (!messages.length) {
        showToast('Nada para enviar.', 'danger');
        return;
      }
      let queued = false;
      for (const message of messages) {
        queued = (await actions.send(target.instanceId, message)).queued || queued;
      }
      showToast(sentNotice(target, queued));
      onSent?.(target, queued);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Não foi possível enviar.', 'danger');
    } finally {
      setBusy(false);
    }
  };

  const common = {
    ref: buttonRef,
    disabled: disabled || busy,
    onMouseDown: (event: React.MouseEvent) => {
      event.stopPropagation();
      // Evita que o editor perca a seleção ao clicar no botão.
      event.preventDefault();
      onPrepare?.();
    },
    onClick: toggle,
    'aria-haspopup': 'menu' as const,
    'aria-expanded': open,
  };

  return (
    <>
      {iconOnly ? (
        <IconButton {...common} label={label} icon={<Send size={12} />} style={style} />
      ) : (
        <Button {...common} icon={<Send size={11} />} title={label} style={style}>
          {label}
        </Button>
      )}
      <MenuPopover anchorRef={buttonRef} open={open} onClose={close} label={label}>
        {targets.length === 0 ? (
          <MenuNote>Nenhum widget no canvas recebe este conteúdo.</MenuNote>
        ) : (
          targets.map((target) => (
            <MenuItem key={target.instanceId} onSelect={() => void sendTo(target)}>
              {target.title}
            </MenuItem>
          ))
        )}
      </MenuPopover>
    </>
  );
}
