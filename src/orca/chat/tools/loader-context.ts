// TermWeave's own: hands ToolRunProps.loadFullOutput to the output rows deep in a run, so no row fetches
// by itself and no prop is threaded through every member (SPEC 5.4, lead note on "load all").
import { createContext, useContext } from "react";

export type LoadFullOutput = (ref: string) => Promise<string>;

export const ToolOutputLoaderContext = createContext<LoadFullOutput | null>(null);

/** The run's loader, or null when a row is drawn outside a ToolRun. */
export function useLoadFullOutput(): LoadFullOutput | null {
  return useContext(ToolOutputLoaderContext);
}
