define(['./markdown', './maruku'], function(Markdown, Maruku) {
  // Instiki dialect
  return Markdown.registerDialect('Instiki', Maruku, function(dialect) {
    dialect.block.code_backticks = function code( block, next ) {
      var ret = [],
          //re = /^(?: {0,3}\t| {4})(.*)\n?/,
          re_begin = /^(?:```([^\n\s`]+)?)\s*/,
          re_end = /^\n?```\s*$/;

      var m = block.match( re_begin );

      if ( !m ) return undefined;

      code_type = m[1];
      lineNumber = block.lineNumber + 1;
      block = block.substr( m[0].length );

      block_search:
      do {
        // Split into lines preserving new lines at end of line
        var lines = block.valueOf().split( /\n/ );

        // Look for the end-tag, and push lines not matching.
        for (var line_no=0; line_no < lines.length; line_no++) {
          var l = lines[line_no];
          m = re_end.exec(l);
          if (m) {
            // Re-add the remainder of the block (if any)
            if (line_no + 1 < lines.length) {
              next.unshift( Markdown.mk_block(lines.slice(line_no + 1).join(""), block.trailing) );
            }
            break block_search;
          }

          ret.push(l);
        }

        // Block ran out of lines. Join with the next one, and add blank lines that
        // where swallowed when splitting the blocks.
        if (next.length) {
          block = next.shift();
          while (lineNumber !== undefined && block.lineNumber > lineNumber + 1) {
            ret.push("");
            lineNumber += 1;
          }
          lineNumber = block.lineNumber;
        } else {
          // FIXME: WARN - reached end of blocks without close tag
          break block_search;
        }
      } while (true);

      if (code_type !== undefined) {
        return [ [ "code_block", { "class": code_type }, ret.join("\n") ] ];
      } else {
        return [ [ "code_block", ret.join("\n") ] ];
      }
    };

    dialect.inline[ "[[" ] = function wiki_link( text ) {
      var m = text.match( /^\[\[(.+?)(?:\|(.+))?\]\]/ );

      // no match, false alarm
      if ( !m ) {
        return [ 2, "[[" ];
      } else {
        var attrs;
        // Process escapes only
        m[0] = this.dialect.inline.__call__.call( this, m[0], /\\/ )[0];

        attrs = { href: m[1].toLowerCase() || "" };
        // if ( m[2] !== undefined)
        //   attrs.title = m[2];

        var link = [ "link", attrs ];
        if ( m[2] !== undefined ) {
          Array.prototype.push.apply( link, this.processInline( m[2] ) );
        } else {
          Array.prototype.push.apply( link, this.processInline( m[1] ) );
        }
        return [ m[0].length, link ];
      }
    };
  });
});
