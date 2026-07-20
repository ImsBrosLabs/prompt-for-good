# Snapshot runner configuration per contribution

The runner captures a Configuration Snapshot before claiming or starting a contribution and keeps that snapshot stable until it reports completion. Admin changes made during an active contribution apply to the next claim cycle, preventing mid-run changes to provider, model, budgets, verification commands, or repository execution limits from making reports inconsistent.
