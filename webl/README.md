# The WEBL

> "The WEBL alliance is too well equipped."
>   -- Admiral Motti

The WEBL (expansion forthcoming) provides a means of evaluating JavaScript source code in isolated execution contexts, or __padawans__, in the browser. See webl.js for usage instructions.

The WEBL is in the public domain.

# The WEBL server

It is possible to control one or more WEBLs from a Node.js process. WEBLs can even be run in different browsers simultaneously, for example in Firefox and Safari.

The below diagram illustrates the communication between the various components. See webl_server.js for usage instructions.

      +---------------+
      |               |
      |  WEBL server  |
      |               |
      +-------+-------+
              |                                                  Node.js process
              |
     - - - - -|- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
              |
              |                                                     Browser tabs
              |
              +------------------------------------------------------+
              |                                                      |
              |                                                      |
    +---------+----------------------------------------+    +--------v--------+
    |         |                                        |    |                 |
    |         |         WEBL client                    |    |   WEBL client   |
    |         |                                        |    |                 |
    | +-------v------+                                 |    |       ...       |
    | |              |                                 |    |                 |
    | |  WEBL relay  +--------+                        |    +-----------------+
    | |   (worker)   |        |                        |
    | |              |        |                        |           +-----------+
    | +--------------+  +-----v----+                   |           |           |
    |                   |          |                   |           |  Padawan  |
    |                   |   WEBL   +-------------------+-----+----->  (popup)  |
    |                   |          |                   |     |     |           |
    |                   +-----+----+                   |     |     +-----------+
    |                         |                        |     |
    |       +-----------+-----+-----+-----------+      |     |     +-----------+
    |       |           |           |           |      |     |     |           |
    |       |           |           |           |      |     +----->  Padawan  |
    |  +----v---+  +----v---+  +----v---+  +----v---+  |           |  (popup)  |
    |  |Padawan |  |Padawan |  |Padawan |  |Padawan |  |           |           |
    |  | (top)  |  |(iframe)|  |(worker)|  |(worker)|  |           +-----------+
    |  +--------+  +--------+  +--------+  +--------+  |
    |                                                  |
    +--------------------------------------------------+
