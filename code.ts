/// <reference types="@figma/plugin-typings" />

// Show the UI (using external ui.html)
figma.showUI(__html__, { width: 300, height: 515 });

// Check if Variables API is available
const hasVariablesAPI = Boolean(figma.variables && typeof figma.variables.getLocalVariableCollectionsAsync === 'function');

// Get all variable collections (including from libraries)
async function getAllVariableCollections() {
  if (!hasVariablesAPI) {
    console.error("Variables API is not available in this version of Figma");
    figma.ui.postMessage({
      type: 'error',
      message: "Variables API is not available in this version of Figma"
    });
    return [];
  }
  
  try {
    // Get local collections
    const localCollections = await figma.variables.getLocalVariableCollectionsAsync();
    
    // Get library collections
    let libraryCollections = [];
    
    if (typeof figma.getLibraries === 'function') {
      const libraries = figma.getLibraries();
      
      for (const library of libraries) {
        if (library.type === "VARIABLES") {
          try {
            // This loads the library if it's not loaded yet
            await library.loadAsync();
            
            if (typeof figma.variables.getVariableCollectionsFromLibraryAsync === 'function') {
              const collections = await figma.variables.getVariableCollectionsFromLibraryAsync(library);
              
              // Process collections
              for (let i = 0; i < collections.length; i++) {
                const c = collections[i];
                const newCollection = Object.assign({}, c);
                newCollection.libraryName = library.name;
                libraryCollections.push(newCollection);
              }
            }
          } catch (e) {
            console.error("Could not load library: " + library.name, e);
          }
        }
      }
    }
    
    // Return combined collections without spread operator
    return localCollections.concat(libraryCollections);
  } catch (error) {
    console.error("Error getting variable collections:", error);
    return [];
  }
}

// Get spacing variables from all collections
async function getSpacingVariables() {
  const collections = await getAllVariableCollections();
  const spacingTokens = [];
  
  for (const collection of collections) {
    let variables;
    
    try {
      if (collection.libraryName) {
        // For library collections
        if (typeof figma.variables.getVariablesFromLibraryCollectionAsync === 'function') {
          variables = await figma.variables.getVariablesFromLibraryCollectionAsync(collection);
        } else {
          continue;
        }
      } else {
        // For local collections
        if (typeof figma.variables.getVariablesByCollectionIdAsync === 'function') {
          variables = await figma.variables.getVariablesByCollectionIdAsync(collection.id);
        } else {
          continue;
        }
      }
      
      // Filter for spacing variables and extract values
      for (const variable of variables) {
        // Check if this is a spacing variable by name or mode
        // Accept any variable with number values that contains spacing-related terms
        const hasSpacingName = /space|spacing|gap|padding|margin/i.test(variable.name);
        const modeId = collection.defaultModeId || Object.keys(variable.valuesByMode)[0];
        const value = variable.valuesByMode[modeId];
        
        // Only process numeric values
        if (typeof value === 'number' && (hasSpacingName || value % 4 === 0)) {
          const nameNumber = variable.name.match(/\d+/);
          const nameValue = nameNumber ? parseInt(nameNumber[0]) : null;
          
          spacingTokens.push({
            id: variable.id,
            name: variable.name,
            value: value,
            collectionId: collection.id,
            libraryName: collection.libraryName || null,
            nameMatchesValue: nameValue === value
          });
        }
      }
    } catch (e) {
      console.error("Error processing collection:", e);
    }
  }
  
  return spacingTokens;
}

// Find exact matching spacing token for a value
function findExactSpacingToken(value, spacingTokens) {
  if (!spacingTokens || !spacingTokens.length) return null;
  
  // Try to find exact value match
  for (let i = 0; i < spacingTokens.length; i++) {
    if (spacingTokens[i].value === value) {
      return spacingTokens[i];
    }
  }
  
  return null;
}

// Find spacing issues
async function findSpacingIssues() {
  // Fallback values if Variables API isn't available
  const standardSpacingValues = [0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80];
  const spacingTokens = hasVariablesAPI ? await getSpacingVariables() : [];
  const issues = [];
  
  // Function to recursively check nodes
  function checkNode(node) {
    // Check auto layout spacing
    if (node.type === "FRAME" || node.type === "COMPONENT" || node.type === "INSTANCE") {
      if (node.layoutMode !== "NONE") {
        // Check itemSpacing (gap)
        if (node.itemSpacing > 0) {
          // Check if the spacing is bound to a variable
          const hasBoundVariable = node.boundVariables && 
                                  node.boundVariables.itemSpacing;
          
          if (!hasBoundVariable) {
            // If not bound, check if there's a matching token
            const matchingToken = hasVariablesAPI ? 
              findExactSpacingToken(node.itemSpacing, spacingTokens) : 
              null;
            
            if (matchingToken) {
              // There's a token with this exact value, but it's not bound
              issues.push({
                node: node,
                property: "itemSpacing",
                value: node.itemSpacing,
                matchingToken: matchingToken,
                type: "spacing",
                issue: "unbound"
              });
            } else {
              // No token with this value exists or we're in fallback mode
              issues.push({
                node: node,
                property: "itemSpacing",
                value: node.itemSpacing,
                type: "spacing",
                issue: "non-token-value"
              });
            }
            
            // Add visual indicator
            const indicator = figma.createEllipse();
            indicator.name = "⚠️ Spacing Issue";
            indicator.resize(8, 8);
            indicator.fills = [{type: 'SOLID', color: {r: 1, g: 0, b: 0}}];
            indicator.x = node.x - 10;
            indicator.y = node.y;
          }
        }
        
        // Check padding (for each direction)
        const paddingProps = ['paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom'];
        
        for (const prop of paddingProps) {
          if (node[prop] > 0) {
            // Check if padding is bound to a variable
            const hasBoundVariable = node.boundVariables && 
                                    node.boundVariables[prop];
            
            if (!hasBoundVariable) {
              // If not bound, check if there's a matching token
              const matchingToken = hasVariablesAPI ? 
                findExactSpacingToken(node[prop], spacingTokens) : 
                null;
              
              if (matchingToken) {
                // There's a token with this exact value, but it's not bound
                issues.push({
                  node: node,
                  property: prop,
                  value: node[prop],
                  matchingToken: matchingToken,
                  type: "spacing",
                  issue: "unbound"
                });
              } else {
                // No token with this value exists
                issues.push({
                  node: node,
                  property: prop,
                  value: node[prop],
                  type: "spacing",
                  issue: "non-token-value"
                });
              }
            }
          }
        }
      }
    }
    
    // Recursively check children
    if ("children" in node) {
      for (const child of node.children) {
        checkNode(child);
      }
    }
  }
  
  // Start checking from current selection or top level
  if (figma.currentPage.selection.length > 0) {
    for (const node of figma.currentPage.selection) {
      checkNode(node);
    }
  } else {
    for (const node of figma.currentPage.children) {
      checkNode(node);
    }
  }
  
  return issues;
}

// Find closest spacing token or standard value
function findBestSpacingToken(value, spacingTokens) {
  if (!spacingTokens || spacingTokens.length === 0) {
    // Fallback to standard values if no tokens available
    const standardValues = [0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80];
    let closest = standardValues[0];
    let minDiff = Math.abs(value - standardValues[0]);
    
    for (let i = 0; i < standardValues.length; i++) {
      const diff = Math.abs(value - standardValues[i]);
      if (diff < minDiff) {
        minDiff = diff;
        closest = standardValues[i];
      }
    }
    
    return { value: closest };
  }
  
  // First try an exact match
  for (let i = 0; i < spacingTokens.length; i++) {
    if (spacingTokens[i].value === value) {
      return spacingTokens[i];
    }
  }
  
  // Try to find a token with the value in its name
  for (let i = 0; i < spacingTokens.length; i++) {
    const token = spacingTokens[i];
    if (token.name.includes(String(value))) {
      return token;
    }
  }
  
  // Finally, find the closest value
  let closestToken = spacingTokens[0];
  let minDiff = Math.abs(value - spacingTokens[0].value);
  
  for (let i = 0; i < spacingTokens.length; i++) {
    const token = spacingTokens[i];
    const diff = Math.abs(value - token.value);
    if (diff < minDiff) {
      minDiff = diff;
      closestToken = token;
    }
  }
  
  return closestToken;
}

// Fix spacing issues by binding to variables
async function fixSpacingIssues() {
  const spacingTokens = hasVariablesAPI ? await getSpacingVariables() : [];
  const issues = await findSpacingIssues();
  let fixedCount = 0;
  
  for (const issue of issues) {
    try {
      if (issue.type === "spacing") {
        if (hasVariablesAPI) {
          // Find the best token to use
          const tokenToUse = findBestSpacingToken(issue.value, spacingTokens);
          
          if (tokenToUse && tokenToUse.id) {
            // Bind the property to the variable
            await issue.node.setBoundVariable(issue.property, {
              id: tokenToUse.id,
              type: 'VARIABLE'
            });
            
            fixedCount++;
          } else {
            // Fallback: just set the value
            issue.node[issue.property] = tokenToUse.value;
            fixedCount++;
          }
        } else {
          // Fallback mode: just set standard values
          const bestValue = findBestSpacingToken(issue.value, []).value;
          issue.node[issue.property] = bestValue;
          fixedCount++;
        }
      }
    } catch (e) {
      console.error("Error fixing spacing issue:", e);
    }
  }
  
  return fixedCount;
}

// Clear markers
function clearMarkers() {
  try {
    const markers = figma.currentPage.findAll(node => 
      node.type === "ELLIPSE" && 
      (node.name === "⚠️ Spacing Issue" || node.name === "🎨 Color Issue")
    );
    
    for (let i = 0; i < markers.length; i++) {
      markers[i].remove();
    }
    
    return markers.length;
  } catch (error) {
    console.error("Error clearing markers:", error);
    return 0;
  }
}

// Handle messages from the UI
figma.ui.onmessage = async (msg) => {
  try {
    if (msg.type === 'find-spacing-issues') {
      // Check if Variables API is available
      if (!hasVariablesAPI) {
        figma.ui.postMessage({
          type: 'warning',
          message: "Limited functionality: Variables API not available. Only standard spacing values will be used."
        });
      }
      
      const issues = await findSpacingIssues();
      
      // Count unique nodes with issues
      const uniqueNodeIds = new Set();
      issues.forEach(issue => uniqueNodeIds.add(issue.node.id));
      
      figma.ui.postMessage({
        type: 'spacing-issues-found',
        count: issues.length,
        nodeCount: uniqueNodeIds.size
      });
    } else if (msg.type === 'fix-spacing-issues') {
      const fixedCount = await fixSpacingIssues();
      figma.ui.postMessage({
        type: 'spacing-issues-fixed',
        count: fixedCount
      });
    } else if (msg.type === 'clear-markers') {
      const clearedCount = clearMarkers();
      figma.ui.postMessage({
        type: 'markers-cleared',
        count: clearedCount
      });
    }
  } catch (error) {
    console.error("Error handling message:", error);
    figma.ui.postMessage({
      type: 'error',
      message: "An error occurred: " + error.message
    });
  }
};