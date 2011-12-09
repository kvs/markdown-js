# BUGS

* test/features/meta/list.text does not get its metadata parsed.
  `processBlocks()` calls `block_meta`, but only with the first block,
  and it doesn't see any metadata. Later, `dialect.block.lists` is called,
  which scans further and sees that the block should be larger, to include
  the entire list.

  At that point, `block_meta` does not get called again, so the metadata
  never gets discovered.

  Maybe the real fix is to pull out the block-expander-logic from `lists`,
  and run it before running anything else? Or do different block-level
  functions have different expanding algorithms?
