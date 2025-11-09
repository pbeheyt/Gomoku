#include <emscripten.h>
#include "gomoku_ai.h"

extern "C" {

/**
 * Simple add function for testing
 */
EMSCRIPTEN_KEEPALIVE
int add(int a, int b) {
    return a + b;
}

}
