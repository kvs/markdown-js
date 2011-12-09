var Markdown = require('../lib/markdown').Markdown,
    mk_block = Markdown.mk_block;

exports.setUp = function(callback) {
  this.md = new Markdown();
  callback();
};

exports.split_block = function(test) {
  test.deepEqual(
      this.md.split_blocks( "# h1 #\n\npara1\npara1L2\n  \n\n\n\npara2\n" ),
      [mk_block( "# h1 #", "\n\n", 1 ),
       mk_block( "para1\npara1L2", "\n  \n\n\n\n", 3 ),
       mk_block( "para2", "\n", 9 )
      ],
      "split_block should record trailing newlines");

  test.deepEqual(
      this.md.split_blocks( "\n\n# heading #\n\npara\n" ),
      [mk_block( "# heading #", "\n\n", 3 ),
       mk_block( "para", "\n", 5 )
      ],
      "split_block should ignore leading newlines");
  test.done();
};

exports.test_headers = function(test) {
  var h1 = this.md.dialect.block.atxHeader( "# h1 #\n\n", [] ), h2;

  test.deepEqual(
    h1,
    this.md.dialect.block.setextHeader( "h1\n===\n\n", [] ),
    "Atx and Setext style H1s should produce the same output" );

  test.deepEqual(
    this.md.dialect.block.atxHeader("# h1\n\n"),
    h1,
    "Closing # optional on atxHeader");

  test.deepEqual(
    h2 = this.md.dialect.block.atxHeader( "## h2\n\n", [] ),
    [["header", {level: 2}, "h2"]],
    "Atx h2 has right level");

  test.deepEqual(
    h2,
    this.md.dialect.block.setextHeader( "h2\n---\n\n", [] ),
    "Atx and Setext style H2s should produce the same output" );

  test.done();
};

exports.test_code = function(test) {
  var code = this.md.dialect.block.code,
      next = [ mk_block("next") ];

  test.deepEqual(
    code.call( this.md, mk_block("    foo\n    bar"), next ),
    [["code_block", "foo\nbar" ]],
    "Code block correct");

  test.deepEqual(
    next, [mk_block("next")],
    "next untouched when its not code");

  next = [];
  test.deepEqual(
    code.call( this.md, mk_block("    foo\n  bar"), next ),
    [["code_block", "foo" ]],
    "Code block correct for abutting para");

  test.deepEqual(
    next, [mk_block("  bar")],
    "paragraph put back into next block");

  test.deepEqual(
    code.call( this.md, mk_block("    foo"), [mk_block("    bar") ] ),
    [["code_block", "foo\n\nbar" ]],
    "adjacent code blocks ");

  test.deepEqual(
    code.call( this.md, mk_block("    foo","\n  \n      \n"), [mk_block("    bar") ] ),
    [["code_block", "foo\n\n\nbar" ]],
    "adjacent code blocks preserve correct number of empty lines");

  test.done();
};

exports.test_bulletlist = function(test) {
  md = this.md;
  var bl = function() { return md.dialect.block.lists.apply(md, arguments); };

  test.deepEqual(
    bl( mk_block("* foo\n* bar"), [] ),
    [ [ "bulletlist", [ "listitem", "foo" ], [ "listitem", "bar" ] ] ],
    "single line bullets");

  test.deepEqual(
    bl( mk_block("* [text](url)" ), [] ),
    [ [ "bulletlist", [ "listitem", [ "link", { href: "url" }, "text" ] ] ] ],
    "link in bullet");

  test.deepEqual(
    bl( mk_block("* foo\nbaz\n* bar\nbaz"), [] ),
    [ [ "bulletlist", [ "listitem", "foo\nbaz" ], [ "listitem", "bar\nbaz" ] ] ],
    "multiline lazy bullets");

  test.deepEqual(
    bl( mk_block("* foo\n  baz\n* bar\n  baz"), [] ),
    [ [ "bulletlist", [ "listitem", "foo\nbaz" ], [ "listitem", "bar\nbaz" ] ] ],
    "multiline tidy bullets");

  test.deepEqual(
    bl( mk_block("* foo\n     baz"), [] ),
    [ [ "bulletlist", [ "listitem", "foo\n baz" ] ] ],
    "only trim 4 spaces from the start of the line");

  /* Test wrong: should end up with 3 nested lists here
  test.deepEqual(
    bl( mk_block(" * one\n  * two\n   * three" ), [] ),
    [ [ "bulletlist", [ "listitem", "one" ], [ "listitem", "two" ], [ "listitem", "three" ] ] ],
    "bullets can be indented up to three spaces");
  */

  test.deepEqual(
    bl( mk_block("  * one"), [ mk_block("    two") ] ),
    [ [ "bulletlist", [ "listitem", [ "para", "one" ], [ "para", "two" ] ] ] ],
    "loose bullet lists can have multiple paragraphs");

  /* Case: no space after bullet - not a list
   | *↵
   |foo
   */
  test.deepEqual(
    bl( mk_block(" *\nfoo") ),
    undefined,
    "Space required after bullet to trigger list");

  /* Case: note the space after the bullet
   | *␣
   |foo
   |bar
   */
  test.deepEqual(
    bl( mk_block(" * \nfoo\nbar"), [ ] ),
    [ [ "bulletlist", [ "listitem", "\nfoo\nbar" ] ] ],
    "space+continuation lines");


  /* Case I:
   | * foo
   |     * bar
   |   * baz
   */
  test.deepEqual(
    bl( mk_block(" * foo\n" +
                 "      * bar\n" +
                 "    * baz"),
        [] ),
    [ [ "bulletlist",
        [ "listitem",
          "foo",
          [ "bulletlist",
            [ "listitem",
              "bar",
              [ "bulletlist",
                [ "listitem", "baz" ]
              ]
            ]
          ]
        ]
    ] ],
    "Interesting indented lists I");

  /* Case II:
   | * foo
   |      * bar
   | * baz
   */
  test.deepEqual(
    bl( mk_block(" * foo\n      * bar\n * baz"), [] ),
    [ [ "bulletlist",
        [ "listitem",
          "foo",
          [ "bulletlist",
            [ "listitem", "bar" ]
          ]
        ],
        [ "listitem", "baz" ]
    ] ],
    "Interesting indented lists II");

  /* Case III:
   |  * foo
   |   * bar
   |* baz
   | * fnord
   */
  test.deepEqual(
    bl( mk_block("  * foo\n   * bar\n* baz\n * fnord"), [] ),
    [ [ "bulletlist",
        [ "listitem",
          "foo",
          [ "bulletlist",
            [ "listitem", "bar" ],
            [ "listitem", "baz" ],
            [ "listitem", "fnord" ]
          ]
        ]
    ] ],
    "Interesting indented lists III");

  /* Case IV:
   | * foo
   |
   | 1. bar
   */
  test.deepEqual(
    bl( mk_block(" * foo"), [ mk_block(" 1. bar\n") ] ),
    [ [ "bulletlist",
        ["listitem", ["para", "foo"] ],
        ["listitem", ["para", "bar"] ]
    ] ],
    "Different lists at same indent IV");

  /* Case V:
   |   * foo
   |  * bar
   | * baz
   */
  test.deepEqual(
    bl( mk_block("   * foo\n  * bar\n * baz"), [] ),
    [ [ "bulletlist",
        [ "listitem",
          "foo",
          [ "bulletlist",
            ["listitem", "bar"],
            ["listitem", "baz"]
          ]
        ]
    ] ],
    "Indenting Case V");

  /* Case VI: deep nesting
   |* one
   |    * two
   |        * three
   |            * four
   */
  test.deepEqual(
    bl( mk_block("* one\n    * two\n        * three\n            * four"), [] ),
    [ [ "bulletlist",
        [ "listitem",
          "one",
          [ "bulletlist",
            [ "listitem",
              "two",
              [ "bulletlist",
                [ "listitem",
                  "three",
                  [ "bulletlist",
                    [ "listitem", "four" ]
                  ]
                ]
              ]
            ]
          ]
        ]
    ] ],
    "deep nested lists VI");

  /* Case VII: This one is just fruity!
   |   * foo
   |  * bar
   | * baz
   |* HATE
   |  * flibble
   |   * quxx
   |    * nest?
   |        * where
   |      * am
   |     * i?
   */
  test.deepEqual(
    bl( mk_block("   * foo\n" +
                 "  * bar\n" +
                 " * baz\n" +
                 "* HATE\n" +
                 "  * flibble\n" +
                 "   * quxx\n" +
                 "    * nest?\n" +
                 "        * where\n" +
                 "      * am\n" +
                 "     * i?"),
      [] ),
    [ [ "bulletlist",
        [ "listitem",
          "foo",
          [ "bulletlist",
            ["listitem", "bar"],
            ["listitem", "baz"],
            ["listitem", "HATE"],
            ["listitem", "flibble"]
          ]
        ],
        [ "listitem",
          "quxx",
          [ "bulletlist",
            [ "listitem",
              "nest?",
              [ "bulletlist",
                ["listitem", "where"],
                ["listitem", "am"],
                ["listitem", "i?"]
              ]
            ]
          ]
        ]
    ] ],
    "Indenting Case VII");

  /* Case VIII: Deep nesting + code block
   |   * one
   |    * two
   |        * three
   |                * four
   |
   |                foo
   */
  test.deepEqual(
    bl( mk_block("   * one\n" +
                 "    1. two\n" +
                 "        * three\n" +
                 "                * four",
                 "\n\n"),
        [ mk_block("                foo") ] ),
    [ [ "bulletlist",
        [ "listitem",
          ["para", "one"],
          [ "numberlist",
            [ "listitem",
              ["para", "two"],
              [ "bulletlist",
                [ "listitem",
                  [ "para", "three\n    * four"],
                  ["code_block", "foo"]
                ]
              ]
            ]
          ]
        ]
    ] ],
    "Case VIII: Deep nesting and code block");

  test.done();
};

exports.test_horizRule = function(test) {
  var hr = this.md.dialect.block.horizRule,
      strs = ["---", "_ __", "** ** **", "--- "];
  strs.forEach( function(s) {
    test.deepEqual(
      hr.call( this.md, mk_block(s), [] ),
      [ [ "hr" ] ],
      "simple hr from " + s);
  });

  test.done();
};

exports.test_blockquote = function(test) {
  var bq = this.md.dialect.block.blockquote;
  test.deepEqual(
    bq.call( this.md, mk_block("> foo\n> bar"), [] ),
    [ ["blockquote", ["para", "foo\nbar"] ] ],
    "simple blockquote");

  // Note: this tests horizRule as well through block processing.
  test.deepEqual(
    bq.call( this.md, mk_block("> foo\n> bar\n>\n>- - - "), [] ),
    [ ["blockquote",
        ["para", "foo\nbar"],
        ["hr"]
    ] ],
    "blockquote with interesting content");

  test.done();
};

exports.test_referenceDefn = function(test) {
  md = this.md;
  var rd = md.dialect.block.referenceDefn;

  [ '[id]: http://example.com/  "Optional Title Here"',
    "[id]: http://example.com/  'Optional Title Here'",
    '[id]: http://example.com/  (Optional Title Here)'
  ].forEach( function(s) {
    md.tree = ["markdown"];

    test.deepEqual(rd.call( md, mk_block(s) ), [], "ref processed");

    test.deepEqual(md.tree[ 1 ].references,
                 { "id": { href: "http://example.com/", title: "Optional Title Here" } },
                 "reference extracted");
  });

  // Check a para abbuting a ref works right
  md.tree = ["markdown"];
  var next = [];
  test.deepEqual(rd.call( md, mk_block("[id]: example.com\npara"), next ), [], "ref processed");
  test.deepEqual(md.tree[ 1 ].references, { "id": { href: "example.com" } }, "reference extracted");
  test.deepEqual(next, [ mk_block("para") ], "paragraph put back into blocks");

  test.done();
};

exports.test_inline_br = function(test) {
  test.deepEqual(
    this.md.processInline("foo  \n\\[bar"),
    [ "foo", ["linebreak"], "[bar" ], "linebreak+escape");

  test.done();
};

exports.test_inline_escape = function(test) {
  test.deepEqual( this.md.processInline("\\bar"), [ "\\bar" ], "invalid escape" );
  test.deepEqual( this.md.processInline("\\*foo*"), [ "*foo*" ], "escaped em" );
  test.done();
};

exports.test_inline_code = function(test) {
  test.deepEqual( this.md.processInline("`bar`"), [ ["inlinecode", "bar" ] ], "code I" );
  test.deepEqual( this.md.processInline("``b`ar``"), [ ["inlinecode", "b`ar" ] ], "code II" );
  test.deepEqual( this.md.processInline("```bar``` baz"), [ ["inlinecode", "bar" ], " baz" ], "code III" );
  test.done();
};

exports.test_inline_strong_em = function(test) {
  // Yay for horrible edge cases >_<
  test.deepEqual( this.md.processInline("foo *abc* bar"), [ "foo ", ["em", "abc" ], " bar" ], "strong/em I" );
  test.deepEqual( this.md.processInline("*abc `code`"), [ "*abc ", ["inlinecode", "code" ] ], "strong/em II" );
  test.deepEqual( this.md.processInline("*abc**def* after"), [ ["em", "abc**def" ], " after" ], "strong/em III" );
  test.deepEqual( this.md.processInline("*em **strong * wtf**"), [ ["em", "em **strong " ], " wtf**" ], "strong/em IV" );
  test.deepEqual( this.md.processInline("*foo _b*a*r baz"), [ [ "em", "foo _b" ], "a*r baz" ], "strong/em V" );
  test.done();
};

exports.test_inline_img = function(test) {
  test.deepEqual( this.md.processInline( "![alt] (url)" ),
                                  [ [ "img", { href: "url", alt: "alt" } ] ],
                                  "inline img I" );

  test.deepEqual( this.md.processInline( "![alt](url 'title')" ),
                                  [ [ "img", { href: "url", alt: "alt", title: "title" } ] ],
                                  "inline img II" );

  test.deepEqual( this.md.processInline( "![alt] (url 'tit'le') after')" ),
                                  [ [ "img", { href: "url", alt: "alt", title: "tit'le" } ], " after')" ],
                                  "inline img III" );

  test.deepEqual( this.md.processInline( "![alt] (url \"title\")" ),
                                  [ [ "img", { href: "url", alt: "alt", title: "title" } ] ],
                                  "inline img IV" );

  test.deepEqual( this.md.processInline( "![alt][id]" ),
                                  [ [ "img_ref", { ref: "id", alt: "alt", text: "![alt][id]" } ] ],
                                  "ref img I" );

  test.deepEqual( this.md.processInline( "![alt] [id]" ),
                                  [ [ "img_ref", { ref: "id", alt: "alt", text: "![alt] [id]" } ] ],
                                  "ref img II" );
  test.done();
};

exports.test_inline_link = function(test) {
  test.deepEqual( this.md.processInline( "[text] (url)" ),
                                  [ [ "link", { href: "url" }, "text" ] ],
                                  "inline link I" );

  test.deepEqual( this.md.processInline( "[text](url 'title')" ),
                                  [ [ "link", { href: "url", title: "title" }, "text" ] ],
                                  "inline link II" );

  test.deepEqual( this.md.processInline( "[text](url 'tit'le') after')" ),
                                  [ [ "link", { href: "url", title: "tit'le" }, "text" ], " after')" ],
                                  "inline link III" );

  test.deepEqual( this.md.processInline( "[text](url \"title\")" ),
                                  [ [ "link", { href: "url", title: "title" }, "text" ] ],
                                  "inline link IV" );

  test.deepEqual( this.md.processInline( "[text][id]" ),
                                  [ [ "link_ref", { ref: "id", original: "[text][id]" }, "text" ] ],
                                  "ref link I" );

  test.deepEqual( this.md.processInline( "[text] [id]" ),
                                  [ [ "link_ref", { ref: "id", original: "[text] [id]" }, "text" ] ],
                                  "ref link II" );
  test.done();
};

exports.inline_autolink = function(test) {
  test.deepEqual( this.md.processInline( "<http://foo.com>" ),
                                  [ [ "link", { href: "http://foo.com" }, "http://foo.com" ] ],
                                  "autolink I" );

  test.deepEqual( this.md.processInline( "<mailto:foo@bar.com>" ),
                                  [ [ "link", { href: "mailto:foo@bar.com" }, "foo@bar.com" ] ],
                                  "autolink II" );

  test.deepEqual( this.md.processInline( "<foo@bar.com>" ),
                                  [ [ "link", { href: "mailto:foo@bar.com" }, "foo@bar.com" ] ],
                                  "autolink III" );
  test.done();
};
