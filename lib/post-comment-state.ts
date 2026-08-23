import { getAllMediaComments, type IgCommentNode } from "@/lib/instagram";

/**
 * One sweep of a post's comments, arranged so we can ask "was this commenter
 * already dealt with, and by whom?".
 *
 * This reads the media comments edge rather than the per-comment replies edge
 * because only the former returns `from` and `parent_id`. The replies edge
 * gives text with no author, which cannot distinguish our reply from anyone
 * else's.
 */

export type HandledBy =
  /** Our own automated public reply — the automation already ran here. */
  | { kind: "automation"; text: string }
  /** A reply from us that isn't the template, i.e. the user answered by hand. */
  | { kind: "manual"; text: string };

export interface PostState {
  /** Top-level comments from other people, newest first. */
  inbound: IgCommentNode[];
  /** Whether the comment still exists on the post. */
  exists(commentId: string): boolean;
  /** Who, if anyone, has already replied under a comment. */
  handledBy(commentId: string): HandledBy | null;
}

export type LoadPostStateResult =
  | { ok: true; state: PostState }
  | { ok: false; gone: boolean; error: string };

function normalize(text: string | undefined | null): string {
  return (text ?? "")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

/** Instagram prefixes "@handle " onto replies made from the app. */
function stripLeadingMentions(text: string): string {
  return text.replace(/^(?:@[\w.]+\s+)+/u, "").trim();
}

/**
 * The parts of a public-reply template that don't change between recipients.
 * Used to recognise our own automated reply even though `{{username}}` and
 * Instagram's "@handle" prefix make the text differ every time.
 */
function templateFingerprints(template: string | null | undefined): string[] {
  const raw = (template ?? "").trim();
  if (!raw) return [];
  return raw
    .split(/\{\{\s*username\s*\}\}/gu)
    .map((chunk) => normalize(stripLeadingMentions(chunk)))
    .filter((chunk) => chunk.length >= 6);
}

function matchesTemplate(replyText: string, fingerprints: string[]): boolean {
  if (fingerprints.length === 0) return false;
  const body = normalize(stripLeadingMentions(replyText));
  if (!body) return false;
  return fingerprints.every((chunk) => body.includes(chunk));
}

/**
 * Whether a single reply looks like it came from the given template. Used by
 * the pre-send guard, where fetching one comment's replies is far cheaper than
 * sweeping the whole post.
 */
export function looksLikeTemplate(
  replyText: string,
  template: string | null | undefined,
): boolean {
  return matchesTemplate(replyText, templateFingerprints(template));
}

/**
 * @param ourIgUserId the connected account's IG user id, so we can tell our
 *   own comments and replies apart from everybody else's.
 * @param publicReplyTemplate the automation's configured public reply, used to
 *   separate "the automation already replied" from "the user replied by hand".
 */
export async function loadPostState(
  mediaId: string,
  token: string,
  ourIgUserId: string,
  publicReplyTemplate: string | null | undefined,
): Promise<LoadPostStateResult> {
  const result = await getAllMediaComments(mediaId, token);
  if (!result.ok) return result;

  const fingerprints = templateFingerprints(publicReplyTemplate);
  const byId = new Map<string, IgCommentNode>();
  const ourRepliesByParent = new Map<string, IgCommentNode[]>();
  const inbound: IgCommentNode[] = [];

  for (const node of result.comments) {
    byId.set(node.id, node);
    const isOurs = node.from?.id === ourIgUserId;

    if (node.parent_id) {
      // Third-party replies don't count as handled: someone else answering a
      // commenter says nothing about whether we did.
      if (isOurs) {
        const list = ourRepliesByParent.get(node.parent_id) ?? [];
        list.push(node);
        ourRepliesByParent.set(node.parent_id, list);
      }
      continue;
    }

    if (!isOurs) inbound.push(node);
  }

  inbound.sort((a, b) => (b.timestamp ?? "").localeCompare(a.timestamp ?? ""));

  return {
    ok: true,
    state: {
      inbound,
      exists: (commentId) => byId.has(commentId),
      handledBy: (commentId) => {
        const replies = ourRepliesByParent.get(commentId);
        if (!replies?.length) return null;
        const automated = replies.find((reply) =>
          matchesTemplate(reply.text ?? "", fingerprints),
        );
        if (automated) {
          return { kind: "automation", text: automated.text ?? "" };
        }
        return { kind: "manual", text: replies[0].text ?? "" };
      },
    },
  };
}
