import { Value } from '@sinclair/typebox/value';
import type { Static, TSchema } from '@sinclair/typebox';

interface ToolEntry {
  schema: TSchema;
  handle: (input: never, context: unknown) => Promise<unknown>;
  authorize: (input: never, context: unknown) => boolean;
}

/** Metadata, handler and authorization rule remain separate at registration. */
export class ToolRegistry {
  private readonly entries = new Map<string, ToolEntry>();

  register<T extends TSchema, R>(name: string, schema: T, handler: (input: Static<T>, context: unknown) => Promise<R>, policy: (input: Static<T>, context: unknown) => boolean = () => true): void {
    if (this.entries.has(name)) throw new Error(`Duplicate tool: ${name}`);
    this.entries.set(name, { schema, handle: handler as ToolEntry['handle'], authorize: policy as ToolEntry['authorize'] });
  }

  async execute<R = unknown>(name: string, input: unknown, context: unknown): Promise<R> {
    const tool = this.entries.get(name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);
    if (!Value.Check(tool.schema, input)) throw new Error(`Invalid tool input: ${name}`);
    if (!tool.authorize(input as never, context)) throw new Error(`Not authorized: ${name}`);
    return await tool.handle(input as never, context) as R;
  }

  names(): string[] { return [...this.entries.keys()]; }
}
