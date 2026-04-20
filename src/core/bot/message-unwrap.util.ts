import type { proto } from 'baileys';

/**
 * Desembrulha envelopes do WhatsApp (mensagens temporárias, visualização única,
 * device-sent, editadas, etc.) e devolve o `IMessage` com o conteúdo real.
 * Protege contra loops com um limite de profundidade.
 */
export function unwrapMessage(
  msg: proto.IMessage | null | undefined,
  depth = 0,
): proto.IMessage | null {
  if (!msg || depth > 5) return msg ?? null;
  if (msg.ephemeralMessage?.message) {
    return unwrapMessage(msg.ephemeralMessage.message, depth + 1);
  }
  if (msg.viewOnceMessage?.message) {
    return unwrapMessage(msg.viewOnceMessage.message, depth + 1);
  }
  if (msg.viewOnceMessageV2?.message) {
    return unwrapMessage(msg.viewOnceMessageV2.message, depth + 1);
  }
  if (msg.viewOnceMessageV2Extension?.message) {
    return unwrapMessage(msg.viewOnceMessageV2Extension.message, depth + 1);
  }
  if (msg.documentWithCaptionMessage?.message) {
    return unwrapMessage(msg.documentWithCaptionMessage.message, depth + 1);
  }
  if (msg.editedMessage?.message) {
    return unwrapMessage(msg.editedMessage.message, depth + 1);
  }
  if (msg.deviceSentMessage?.message) {
    return unwrapMessage(msg.deviceSentMessage.message, depth + 1);
  }
  return msg;
}
