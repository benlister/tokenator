/// <reference types="@figma/plugin-typings" />
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
figma.showUI(__html__, { width: 300, height: 585 });
// API Availability
const hasVariablesAPI = Boolean(figma.variables);
const hasGetLocalVariables = Boolean(hasVariablesAPI && figma.variables.getLocalVariablesAsync);
const hasGetLocalVariableCollections = Boolean(hasVariablesAPI && figma.variables.getLocalVariableCollectionsAsync);
const hasTeamLibraryAPI = Boolean(figma.teamLibrary && figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync && figma.teamLibrary.getVariablesInLibraryCollectionAsync);
const hasImportVariableByKey = Boolean(hasVariablesAPI && figma.variables.importVariableByKeyAsync);
// Enhanced caching system - cache tokens per collection
let cachedSpacingTokensByCollection = new Map();
let cachedBorderRadiusTokensByCollection = new Map();
let cachedCollections = null;
let collectionsTimestamp = 0;
// Clear old single-collection cache variables (keep for fallback)
let cachedSpacingTokens = null;
let cachedBorderRadiusTokens = null;
let cacheTimestamp = 0;
let borderRadiusCacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
function getBorderRadiusVariables() {
    return __awaiter(this, arguments, void 0, function* (forceRefresh = false, filterByCollectionId) {
        const now = Date.now();
        // Create cache key
        const cacheKey = filterByCollectionId || 'all';
        // Check collection-specific cache
        if (!forceRefresh && cachedBorderRadiusTokensByCollection.has(cacheKey)) {
            const cached = cachedBorderRadiusTokensByCollection.get(cacheKey);
            console.log(`Using cached border radius tokens for ${cacheKey} (${cached.length} tokens)`);
            return cached;
        }
        console.log(`Fetching fresh border radius variables for collection: ${cacheKey}`);
        const allResolvedVariables = yield getAllVariablesAndImportLibraries();
        console.log(`Processing ${allResolvedVariables.length} variables for border radius tokens.`);
        const borderRadiusTokens = [];
        for (const variable of allResolvedVariables) {
            if (variable.resolvedType !== 'FLOAT') {
                continue;
            }
            // Filter by collection if specified
            if (filterByCollectionId && variable.variableCollectionId !== filterByCollectionId) {
                continue;
            }
            const variableName = variable.name;
            const modeIds = Object.keys(variable.valuesByMode);
            if (modeIds.length === 0) {
                continue;
            }
            const firstModeId = modeIds[0];
            const variableValue = variable.valuesByMode[firstModeId];
            if (typeof variableValue === 'number' && variableValue >= 0) {
                // Look for border radius related names
                const isBorderRadiusName = /radius|corner|rounded|border.*radius|br-/i.test(variableName);
                if (isBorderRadiusName) {
                    borderRadiusTokens.push({
                        id: variable.id,
                        key: variable.key,
                        name: variableName,
                        value: variableValue,
                        variableObject: variable,
                    });
                }
            }
        }
        // Cache the results by collection
        cachedBorderRadiusTokensByCollection.set(cacheKey, borderRadiusTokens);
        // Also update the legacy cache if this is for "all" collections
        if (!filterByCollectionId) {
            cachedBorderRadiusTokens = borderRadiusTokens;
            borderRadiusCacheTimestamp = now;
        }
        console.log(`Total border radius tokens found and cached for ${cacheKey}: ${borderRadiusTokens.length}`);
        return borderRadiusTokens;
    });
}
function isBorderRadiusNode(node) {
    return node.type === "FRAME" ||
        node.type === "COMPONENT" ||
        node.type === "INSTANCE" ||
        node.type === "RECTANGLE";
}
function hasRadiusProperties(node) {
    return 'topLeftRadius' in node &&
        'topRightRadius' in node &&
        'bottomLeftRadius' in node &&
        'bottomRightRadius' in node;
}
console.log("API availability check:");
console.log("- Variables API:", hasVariablesAPI);
console.log("- getLocalVariablesAsync:", hasGetLocalVariables);
console.log("- getLocalVariableCollectionsAsync:", hasGetLocalVariableCollections);
console.log("- Team Library API (for library variables):", hasTeamLibraryAPI);
console.log("- Import Variable By Key Async:", hasImportVariableByKey);
figma.ui.postMessage({
    type: 'api-check',
    hasVariables: hasVariablesAPI,
    hasGetLocalVariables: hasGetLocalVariables,
    hasGetLocalCollections: hasGetLocalVariableCollections,
    hasTeamLibraryAPI: hasTeamLibraryAPI,
    hasImportVariableByKey: hasImportVariableByKey,
});
// Replace your getAllVariablesAndImportLibraries function with this version
function getAllVariablesAndImportLibraries() {
    return __awaiter(this, void 0, void 0, function* () {
        if (!hasVariablesAPI || !hasImportVariableByKey) {
            console.warn("Variables API or importVariableByKeyAsync not available. Cannot fetch all variables.");
            return [];
        }
        const allVariables = [];
        const processedVariableKeys = new Set();
        console.log("Starting optimized variable collection...");
        const startTime = Date.now();
        // 1. Get Local Variables (usually fast)
        if (hasGetLocalVariables) {
            try {
                console.log("Fetching local variables...");
                const localStart = Date.now();
                const localVariables = yield figma.variables.getLocalVariablesAsync();
                const localEnd = Date.now();
                console.log(`Found ${localVariables.length} local variables in ${(localEnd - localStart)}ms`);
                localVariables.forEach(v => {
                    if (!processedVariableKeys.has(v.key)) {
                        allVariables.push(v);
                        processedVariableKeys.add(v.key);
                    }
                });
            }
            catch (error) {
                console.error("Error getting local variables:", error);
            }
        }
        // 2. Get Variables from Enabled Libraries (potentially slow - optimize this part)
        if (hasTeamLibraryAPI) {
            try {
                console.log("Fetching library collections...");
                const libStart = Date.now();
                const libraryCollections = yield figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
                const libCollectionEnd = Date.now();
                console.log(`Found ${libraryCollections.length} library collections in ${(libCollectionEnd - libStart)}ms`);
                // Process collections in batches to avoid overwhelming the API
                const BATCH_SIZE = 5; // Process 5 variables at a time
                for (const libCollection of libraryCollections) {
                    try {
                        const collectionStart = Date.now();
                        const libraryVariablesInCollection = yield figma.teamLibrary.getVariablesInLibraryCollectionAsync(libCollection.key);
                        // Filter to include both spacing AND border radius related variables by name before importing
                        const relevantVariables = libraryVariablesInCollection.filter(libVar => {
                            const name = libVar.name;
                            const isSpacingName = /space|spacing|gap|padding|margin|size|grid/i.test(name);
                            const isBorderRadiusName = /radius|corner|rounded|border.*radius|br-/i.test(name);
                            return isSpacingName || isBorderRadiusName;
                        });
                        console.log(`Collection "${libCollection.name}": ${libraryVariablesInCollection.length} total, ${relevantVariables.length} spacing/border-radius-related`);
                        // Process in batches
                        for (let i = 0; i < relevantVariables.length; i += BATCH_SIZE) {
                            const batch = relevantVariables.slice(i, i + BATCH_SIZE);
                            const batchPromises = batch.map((libVarStub) => __awaiter(this, void 0, void 0, function* () {
                                if (!processedVariableKeys.has(libVarStub.key)) {
                                    try {
                                        const importedVariable = yield figma.variables.importVariableByKeyAsync(libVarStub.key);
                                        return importedVariable;
                                    }
                                    catch (importError) {
                                        console.error(`Error importing library variable '${libVarStub.name}' (key: ${libVarStub.key}):`, importError);
                                        return null;
                                    }
                                }
                                return null;
                            }));
                            const batchResults = yield Promise.all(batchPromises);
                            batchResults.forEach(variable => {
                                if (variable && !processedVariableKeys.has(variable.key)) {
                                    allVariables.push(variable);
                                    processedVariableKeys.add(variable.key);
                                }
                            });
                            // Small delay between batches to prevent API rate limiting
                            if (i + BATCH_SIZE < relevantVariables.length) {
                                yield new Promise(resolve => setTimeout(resolve, 50));
                            }
                        }
                        const collectionEnd = Date.now();
                        console.log(`Processed collection "${libCollection.name}" in ${(collectionEnd - collectionStart)}ms`);
                    }
                    catch (collectionError) {
                        console.error(`Error processing collection "${libCollection.name}":`, collectionError);
                    }
                }
            }
            catch (error) {
                console.error("Error getting library variables:", error);
            }
        }
        const endTime = Date.now();
        console.log(`Total variable collection completed in ${(endTime - startTime)}ms`);
        console.log(`Total unique variables processed (local + imported library): ${allVariables.length}`);
        return allVariables;
    });
}
function getSpacingVariables() {
    return __awaiter(this, arguments, void 0, function* (forceRefresh = false, filterByCollectionId) {
        const now = Date.now();
        // Create cache key - use collection ID or 'all' for no filter
        const cacheKey = filterByCollectionId || 'all';
        // Check collection-specific cache
        if (!forceRefresh && cachedSpacingTokensByCollection.has(cacheKey)) {
            const cached = cachedSpacingTokensByCollection.get(cacheKey);
            console.log(`Using cached spacing tokens for ${cacheKey} (${cached.length} tokens)`);
            return cached;
        }
        console.log(`Fetching fresh spacing variables for collection: ${cacheKey}`);
        const allResolvedVariables = yield getAllVariablesAndImportLibraries();
        console.log(`Processing ${allResolvedVariables.length} variables for spacing tokens.`);
        const spacingTokens = [];
        for (const variable of allResolvedVariables) {
            if (variable.resolvedType !== 'FLOAT') {
                continue;
            }
            // Filter by collection if specified
            if (filterByCollectionId && variable.variableCollectionId !== filterByCollectionId) {
                continue;
            }
            const variableName = variable.name;
            const modeIds = Object.keys(variable.valuesByMode);
            if (modeIds.length === 0) {
                continue;
            }
            const firstModeId = modeIds[0];
            const variableValue = variable.valuesByMode[firstModeId];
            if (typeof variableValue === 'number' && variableValue >= 0) {
                const isSpacingName = /space|spacing|gap|padding|margin|size|grid/i.test(variableName);
                if (isSpacingName) {
                    spacingTokens.push({
                        id: variable.id,
                        key: variable.key,
                        name: variableName,
                        value: variableValue,
                        variableObject: variable,
                    });
                }
            }
        }
        // Cache the results by collection
        cachedSpacingTokensByCollection.set(cacheKey, spacingTokens);
        // Also update the legacy cache if this is for "all" collections
        if (!filterByCollectionId) {
            cachedSpacingTokens = spacingTokens;
            cacheTimestamp = now;
        }
        console.log(`Total spacing tokens found and cached for ${cacheKey}: ${spacingTokens.length}`);
        return spacingTokens;
    });
}
function isAutoLayoutNode(node) {
    return node.type === "FRAME" || node.type === "COMPONENT" || node.type === "INSTANCE";
}
function findSpacingIssues(filterByCollectionId) {
    return __awaiter(this, void 0, void 0, function* () {
        const spacingTokens = yield getSpacingVariables(false, filterByCollectionId);
        const issues = [];
        // Pre-create a Map for faster token lookup by value
        const tokensByValue = new Map();
        spacingTokens.forEach(token => {
            tokensByValue.set(token.value, token);
        });
        function isIndividualPaddingBound(node, propertyName) {
            var _a;
            try {
                return ((_a = node.boundVariables) === null || _a === void 0 ? void 0 : _a[propertyName]) !== undefined;
            }
            catch (e) {
                console.warn(`Could not check boundVariables for ${node.name}.${propertyName}:`, e);
                return false;
            }
        }
        function isHorizontalPaddingBound(node) {
            return isIndividualPaddingBound(node, 'paddingLeft') && isIndividualPaddingBound(node, 'paddingRight');
        }
        function isVerticalPaddingBound(node) {
            return isIndividualPaddingBound(node, 'paddingTop') && isIndividualPaddingBound(node, 'paddingBottom');
        }
        // Optimized token lookup using Map
        function findMatchingTokenByValue(value) {
            return tokensByValue.get(value) || null;
        }
        function checkNode(node) {
            if (isAutoLayoutNode(node)) {
                if (node.layoutMode !== "NONE") {
                    // Check itemSpacing
                    if (node.itemSpacing !== undefined && node.itemSpacing > 0 && !isIndividualPaddingBound(node, 'itemSpacing')) {
                        const token = findMatchingTokenByValue(node.itemSpacing);
                        issues.push({
                            node: node,
                            property: "itemSpacing",
                            currentValue: node.itemSpacing,
                            matchingToken: token,
                            message: token ? `Map to ${token.name} (${token.value}px)` : `No exact token for ${node.itemSpacing}px gap.`,
                        });
                        addMarkerToNode(node, token ? "✅ Can Fix Spacing" : "⚠️ No Token Match", token !== null);
                    }
                    // Check padding (existing logic remains the same)
                    const { paddingTop, paddingBottom, paddingLeft, paddingRight } = node;
                    const allPaddingsSameAndPositive = paddingTop > 0 && paddingTop === paddingBottom && paddingTop === paddingLeft && paddingTop === paddingRight;
                    if (allPaddingsSameAndPositive &&
                        !isIndividualPaddingBound(node, 'paddingTop') &&
                        !isIndividualPaddingBound(node, 'paddingBottom') &&
                        !isIndividualPaddingBound(node, 'paddingLeft') &&
                        !isIndividualPaddingBound(node, 'paddingRight')) {
                        const token = findMatchingTokenByValue(paddingTop);
                        issues.push({ node, property: "paddingAll", currentValue: paddingTop, matchingToken: token, message: token ? `Map all padding to ${token.name}` : `No token for ${paddingTop}px uniform padding.` });
                        addMarkerToNode(node, token ? "✅ Can Fix Spacing" : "⚠️ No Token Match", token !== null);
                    }
                    else {
                        // Handle horizontal padding
                        if (paddingLeft > 0 && paddingLeft === paddingRight && !allPaddingsSameAndPositive && !isHorizontalPaddingBound(node)) {
                            const token = findMatchingTokenByValue(paddingLeft);
                            issues.push({ node, property: "horizontalPadding", currentValue: paddingLeft, matchingToken: token, message: token ? `Map horiz. padding to ${token.name}` : `No token for ${paddingLeft}px horiz. padding.` });
                            addMarkerToNode(node, token ? "✅ Can Fix Spacing" : "⚠️ No Token Match", token !== null);
                        }
                        else {
                            // Individual left padding
                            if (paddingLeft > 0 && !isIndividualPaddingBound(node, 'paddingLeft') && !allPaddingsSameAndPositive && !(paddingLeft === paddingRight && !isHorizontalPaddingBound(node))) {
                                const token = findMatchingTokenByValue(paddingLeft);
                                issues.push({ node, property: "paddingLeft", currentValue: paddingLeft, matchingToken: token, message: token ? `Map left padding to ${token.name}` : `No token for ${paddingLeft}px left padding.` });
                                addMarkerToNode(node, token ? "✅ Can Fix Spacing" : "⚠️ No Token Match", token !== null);
                            }
                            // Individual right padding
                            if (paddingRight > 0 && !isIndividualPaddingBound(node, 'paddingRight') && !allPaddingsSameAndPositive && !(paddingLeft === paddingRight && !isHorizontalPaddingBound(node))) {
                                const token = findMatchingTokenByValue(paddingRight);
                                issues.push({ node, property: "paddingRight", currentValue: paddingRight, matchingToken: token, message: token ? `Map right padding to ${token.name}` : `No token for ${paddingRight}px right padding.` });
                                addMarkerToNode(node, token ? "✅ Can Fix Spacing" : "⚠️ No Token Match", token !== null);
                            }
                        }
                        // Handle vertical padding
                        if (paddingTop > 0 && paddingTop === paddingBottom && !allPaddingsSameAndPositive && !isVerticalPaddingBound(node)) {
                            const token = findMatchingTokenByValue(paddingTop);
                            issues.push({ node, property: "verticalPadding", currentValue: paddingTop, matchingToken: token, message: token ? `Map vert. padding to ${token.name}` : `No token for ${paddingTop}px vert. padding.` });
                            addMarkerToNode(node, token ? "✅ Can Fix Spacing" : "⚠️ No Token Match", token !== null);
                        }
                        else {
                            // Individual top padding
                            if (paddingTop > 0 && !isIndividualPaddingBound(node, 'paddingTop') && !allPaddingsSameAndPositive && !(paddingTop === paddingBottom && !isVerticalPaddingBound(node))) {
                                const token = findMatchingTokenByValue(paddingTop);
                                issues.push({ node, property: "paddingTop", currentValue: paddingTop, matchingToken: token, message: token ? `Map top padding to ${token.name}` : `No token for ${paddingTop}px top padding.` });
                                addMarkerToNode(node, token ? "✅ Can Fix Spacing" : "⚠️ No Token Match", token !== null);
                            }
                            // Individual bottom padding
                            if (paddingBottom > 0 && !isIndividualPaddingBound(node, 'paddingBottom') && !allPaddingsSameAndPositive && !(paddingTop === paddingBottom && !isVerticalPaddingBound(node))) {
                                const token = findMatchingTokenByValue(paddingBottom);
                                issues.push({ node, property: "paddingBottom", currentValue: paddingBottom, matchingToken: token, message: token ? `Map bottom padding to ${token.name}` : `No token for ${paddingBottom}px bottom padding.` });
                                addMarkerToNode(node, token ? "✅ Can Fix Spacing" : "⚠️ No Token Match", token !== null);
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
        // Smart scoping: prioritize selection, but don't process entire page unnecessarily
        const selection = figma.currentPage.selection;
        const nodesToCheck = selection.length > 0 ? selection : figma.currentPage.children;
        const collectionText = filterByCollectionId ? ` using collection filter` : '';
        console.log(`Analyzing ${nodesToCheck.length} ${selection.length > 0 ? 'selected' : 'top-level'} nodes for spacing issues${collectionText}...`);
        for (const node of nodesToCheck) {
            checkNode(node);
        }
        console.log(`Found ${issues.length} potential spacing issues.`);
        return issues;
    });
}
// Updated function to add color-coded markers based on whether the issue can be fixed
// Updated function to add different markers based on issue type
function addMarkerToNode(node, name, canFix, issueType = 'spacing') {
    try {
        // Remove any existing markers for this node first
        const existingMarkers = figma.currentPage.findAll(n => (n.type === "ELLIPSE" || n.type === "RECTANGLE") &&
            n.getPluginData("markerFor") === node.id);
        existingMarkers.forEach(marker => marker.remove());
        // Create appropriate marker shape based on issue type
        let indicator;
        if (issueType === 'borderRadius') {
            // Use rectangles for border radius issues
            indicator = figma.createRectangle();
            indicator.resize(8, 8);
            if (canFix) {
                indicator.name = "✅ Can Fix Border Radius";
                indicator.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.4, b: 0.8 } }]; // Blue
            }
            else {
                indicator.name = "⚠️ No Radius Token";
                indicator.fills = [{ type: 'SOLID', color: { r: 0.8, g: 0.4, b: 0.2 } }]; // Orange
            }
        }
        else {
            // Use circles for spacing issues (existing behavior)
            indicator = figma.createEllipse();
            indicator.resize(8, 8);
            if (canFix) {
                indicator.name = "✅ Can Fix Spacing";
                indicator.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.8, b: 0.2 } }]; // Green
            }
            else {
                indicator.name = "⚠️ No Token Match";
                indicator.fills = [{ type: 'SOLID', color: { r: 1, g: 0.2, b: 0.2 } }]; // Red
            }
        }
        const absoluteX = node.absoluteTransform[0][2];
        const absoluteY = node.absoluteTransform[1][2];
        indicator.x = absoluteX - 12;
        indicator.y = absoluteY;
        indicator.setPluginData("markerFor", node.id);
        figma.currentPage.appendChild(indicator);
    }
    catch (e) {
        let message = 'Unknown error';
        if (e instanceof Error)
            message = e.message;
        else if (typeof e === 'string')
            message = e;
        console.error(`Error adding marker to node ${node.name}: ${message}`);
    }
}
// trySetBoundVariable now accepts the full SpacingToken object
function trySetBoundVariable(node, propertyName, token // Changed from variableId to the full token
) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            // Pass the actual Variable object from the token
            console.log(`Binding ${node.name}.${propertyName} to variable: ${token.name} (ID: ${token.id})`);
            node.setBoundVariable(propertyName, token.variableObject); // Use token.variableObject
            // Verify using node.boundVariables and the token's ID
            const boundVariableAlias = (_a = node.boundVariables) === null || _a === void 0 ? void 0 : _a[propertyName];
            if (boundVariableAlias && boundVariableAlias.id === token.id) { // Compare with token.id
                console.log(`Successfully bound ${propertyName} for ${node.name} to ${token.name}`);
                return true;
            }
            else {
                console.warn(`Verification failed for ${node.name}.${propertyName}. Bound alias:`, boundVariableAlias, `Expected ID: ${token.id}`);
                return false;
            }
        }
        catch (e) {
            let message = 'Unknown error during binding';
            if (e instanceof Error)
                message = e.message;
            else if (typeof e === 'string')
                message = e;
            console.error(`Error binding ${propertyName} for node ${node.name} to variable ${token.name} (ID: ${token.id}): ${message}`);
            // Check if the variable object itself might be an issue (though less likely if it came from getSpacingVariables)
            if (!token.variableObject || typeof token.variableObject.key !== 'string') {
                console.error("The provided token.variableObject seems invalid:", token.variableObject);
            }
            return false;
        }
    });
}
function fixSpacingIssues(filterByCollectionId) {
    return __awaiter(this, void 0, void 0, function* () {
        clearMarkers();
        const issues = yield findSpacingIssues(filterByCollectionId);
        let fixedCount = 0;
        let unfixableCount = 0;
        const collectionText = filterByCollectionId ? ` using collection filter` : '';
        console.log(`Attempting to fix ${issues.length} spacing issues${collectionText}.`);
        // Count issues that don't have matching tokens
        issues.forEach(issue => {
            if (!issue.matchingToken) {
                unfixableCount++;
            }
        });
        for (const issue of issues) {
            // Ensure matchingToken and its variableObject are valid before proceeding
            if (issue.matchingToken && issue.matchingToken.variableObject) {
                const { node, property, matchingToken } = issue;
                let success = false;
                if (property === "paddingAll") {
                    const propsToBind = ['paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight'];
                    let allSuccess = true;
                    for (const p of propsToBind) {
                        // Pass the full matchingToken
                        if (!(yield trySetBoundVariable(node, p, matchingToken)))
                            allSuccess = false;
                    }
                    success = allSuccess;
                }
                else if (property === "horizontalPadding") {
                    // Pass the full matchingToken
                    const S1 = yield trySetBoundVariable(node, 'paddingLeft', matchingToken);
                    const S2 = yield trySetBoundVariable(node, 'paddingRight', matchingToken);
                    success = S1 && S2;
                }
                else if (property === "verticalPadding") {
                    // Pass the full matchingToken
                    const S1 = yield trySetBoundVariable(node, 'paddingTop', matchingToken);
                    const S2 = yield trySetBoundVariable(node, 'paddingBottom', matchingToken);
                    success = S1 && S2;
                }
                else if (property === "itemSpacing" || property === "paddingLeft" || property === "paddingRight" || property === "paddingTop" || property === "paddingBottom") {
                    // Pass the full matchingToken
                    success = yield trySetBoundVariable(node, property, matchingToken);
                }
                if (success) {
                    fixedCount++;
                }
            }
        }
        console.log(`Successfully applied ${fixedCount} spacing variable bindings.`);
        console.log(`Unable to fix ${unfixableCount} issues due to missing matching tokens.`);
        if (fixedCount > 0) {
            figma.notify(`Applied ${fixedCount} spacing variable bindings. ${unfixableCount > 0 ? `${unfixableCount} values have no matching tokens (marked in red).` : ''}`);
        }
        else if (unfixableCount > 0) {
            figma.notify(`Found ${unfixableCount} spacing values without matching tokens (marked in red).`);
        }
        else if (issues.length === 0) {
            figma.notify(`No unlinked spacing values found.`);
        }
        // Instead of running findSpacingIssues again, let's return our counts
        return { fixed: fixedCount, unfixable: unfixableCount };
    });
}
function revertSpacingBindingsToStatic() {
    return __awaiter(this, void 0, void 0, function* () {
        let revertedCount = 0;
        // Helper function to remove binding and set static value
        function removeBindingAndSetStatic(node, property) {
            try {
                // Check if the property has a binding
                if (!node.boundVariables || !node.boundVariables[property]) {
                    return false;
                }
                // Get the current computed value before removing the binding
                const currentValue = node[property];
                // Remove the binding
                node.setBoundVariable(property, null);
                // Set the static value to match what it was
                node[property] = currentValue;
                return true;
            }
            catch (e) {
                console.error(`Error removing binding for ${property} on node "${node.name}":`, e);
                return false;
            }
        }
        // Function to process a node and revert its spacing bindings
        function processNode(node) {
            let nodeRevertCount = 0;
            if (isAutoLayoutNode(node)) {
                // List of all potential spacing properties we might have bound
                const spacingProperties = [
                    'itemSpacing',
                    'paddingTop',
                    'paddingBottom',
                    'paddingLeft',
                    'paddingRight'
                ];
                // Check each property and revert if bound
                for (const property of spacingProperties) {
                    if (removeBindingAndSetStatic(node, property)) {
                        nodeRevertCount++;
                        console.log(`Reverted ${property} on node "${node.name}" to static value ${node[property]}px`);
                    }
                }
            }
            // Process children recursively
            if ("children" in node) {
                for (const child of node.children) {
                    nodeRevertCount += processNode(child);
                }
            }
            return nodeRevertCount;
        }
        // Get nodes to process (selection or all page nodes)
        const nodesToProcess = figma.currentPage.selection.length > 0
            ? figma.currentPage.selection
            : figma.currentPage.children;
        // Process all nodes
        for (const node of nodesToProcess) {
            revertedCount += processNode(node);
        }
        console.log(`Reverted ${revertedCount} spacing token bindings to static values.`);
        return revertedCount;
    });
}
// Update to the message handler in the main code
// Add this to your message handler - replace the existing figma.ui.onmessage
// Updated message handler with all new border radius functionality
// Enhanced message handler with collection filtering support
figma.ui.onmessage = (msg) => __awaiter(this, void 0, void 0, function* () {
    console.log("Received message from UI:", msg.type);
    try {
        if (msg.type === 'get-collections') {
            // New message type to fetch available collections
            const collections = yield getAvailableCollections();
            figma.ui.postMessage({
                type: 'collections-loaded',
                collections: collections
            });
        }
        else if (msg.type === 'find-all-issues') {
            // Enhanced find function with collection filters
            clearMarkers();
            const spacingCollectionId = msg.spacingCollectionId || undefined;
            const borderRadiusCollectionId = msg.borderRadiusCollectionId || undefined;
            const results = yield findAllIssues(spacingCollectionId, borderRadiusCollectionId);
            const uniqueNodeIds = new Set([
                ...results.spacingIssues.map(issue => issue.node.id),
                ...results.borderRadiusIssues.map(issue => issue.node.id)
            ]);
            figma.ui.postMessage({
                type: 'all-issues-found',
                totalCount: results.totalIssues,
                spacingCount: results.spacingIssues.length,
                borderRadiusCount: results.borderRadiusIssues.length,
                fixableCount: results.fixableIssues,
                unfixableCount: results.unfixableIssues,
                nodeCount: uniqueNodeIds.size,
            });
            if (results.totalIssues > 0) {
                const spacingText = results.spacingIssues.length > 0 ? `${results.spacingIssues.length} spacing` : '';
                const borderRadiusText = results.borderRadiusIssues.length > 0 ? `${results.borderRadiusIssues.length} border radius` : '';
                const issueTypes = [spacingText, borderRadiusText].filter(text => text).join(' and ');
                const fixableMessage = results.fixableIssues > 0 ?
                    `${results.fixableIssues} can be auto-fixed` : '';
                const unfixableMessage = results.unfixableIssues > 0 ?
                    `${results.unfixableIssues} have no matching tokens` : '';
                figma.notify(`Found ${results.totalIssues} issues (${issueTypes}). ${fixableMessage}${fixableMessage && unfixableMessage ? '. ' : ''}${unfixableMessage}`);
            }
            else {
                figma.notify(`No tokenization issues found.`);
            }
        }
        else if (msg.type === 'find-spacing-issues') {
            // Keep existing spacing-only function with optional collection filter
            clearMarkers();
            const spacingCollectionId = msg.spacingCollectionId || undefined;
            const issues = yield findSpacingIssues(spacingCollectionId);
            const uniqueNodeIds = new Set(issues.map(issue => issue.node.id));
            const fixableIssues = issues.filter(issue => issue.matchingToken !== null);
            const unfixableIssues = issues.filter(issue => issue.matchingToken === null);
            figma.ui.postMessage({
                type: 'spacing-issues-found',
                count: issues.length,
                fixableCount: fixableIssues.length,
                unfixableCount: unfixableIssues.length,
                nodeCount: uniqueNodeIds.size,
            });
            if (issues.length > 0) {
                const fixableMessage = fixableIssues.length > 0 ?
                    `${fixableIssues.length} can be auto-fixed (green markers)` : '';
                const unfixableMessage = unfixableIssues.length > 0 ?
                    `${unfixableIssues.length} have no matching tokens (red markers)` : '';
                figma.notify(`Found ${issues.length} spacing issues. ${fixableMessage}${fixableMessage && unfixableMessage ? '. ' : ''}${unfixableMessage}`);
            }
            else {
                figma.notify(`No unlinked spacing values found.`);
            }
        }
        else if (msg.type === 'fix-spacing-issues') {
            const spacingCollectionId = msg.spacingCollectionId || undefined;
            const result = yield fixSpacingIssues(spacingCollectionId);
            figma.ui.postMessage({
                type: 'spacing-issues-fixed',
                fixedCount: result.fixed,
                unfixableCount: result.unfixable
            });
        }
        else if (msg.type === 'fix-border-radius-issues') {
            const borderRadiusCollectionId = msg.borderRadiusCollectionId || undefined;
            const result = yield fixBorderRadiusIssues(borderRadiusCollectionId);
            figma.ui.postMessage({
                type: 'border-radius-issues-fixed',
                fixedCount: result.fixed,
                unfixableCount: result.unfixable
            });
            if (result.fixed > 0) {
                figma.notify(`Applied ${result.fixed} border radius variable bindings. ${result.unfixable > 0 ? `${result.unfixable} values have no matching tokens (marked in orange).` : ''}`);
            }
            else if (result.unfixable > 0) {
                figma.notify(`Found ${result.unfixable} border radius values without matching tokens (marked in orange).`);
            }
            else {
                figma.notify(`No unlinked border radius values found.`);
            }
        }
        else if (msg.type === 'clear-markers') {
            const clearedCount = clearMarkers();
            figma.ui.postMessage({
                type: 'markers-cleared',
                count: clearedCount
            });
            if (clearedCount > 0)
                figma.notify(`Cleared ${clearedCount} markers.`);
        }
        else if (msg.type === 'revert-all-bindings') {
            // Updated revert function for both types
            const result = yield revertAllBindingsToStatic();
            figma.ui.postMessage({
                type: 'all-bindings-reverted',
                spacingCount: result.spacingCount,
                borderRadiusCount: result.borderRadiusCount,
                totalCount: result.totalCount
            });
            if (result.totalCount > 0) {
                const spacingText = result.spacingCount > 0 ? `${result.spacingCount} spacing` : '';
                const borderRadiusText = result.borderRadiusCount > 0 ? `${result.borderRadiusCount} border radius` : '';
                const revertedTypes = [spacingText, borderRadiusText].filter(text => text).join(' and ');
                figma.notify(`Converted ${result.totalCount} token bindings (${revertedTypes}) back to static values.`);
            }
            else {
                figma.notify(`No token bindings found to revert.`);
            }
        }
        else if (msg.type === 'revert-spacing-bindings') {
            // Keep old function for backwards compatibility
            const revertedCount = yield revertSpacingBindingsToStatic();
            figma.ui.postMessage({
                type: 'spacing-bindings-reverted',
                count: revertedCount
            });
            if (revertedCount > 0) {
                figma.notify(`Converted ${revertedCount} spacing token bindings back to static values.`);
            }
            else {
                figma.notify(`No spacing token bindings found to revert.`);
            }
        }
        else if (msg.type === 'refresh-variables') {
            // Force refresh all caches
            console.log("Force refreshing variables cache...");
            // Clear collection-specific caches
            cachedSpacingTokensByCollection.clear();
            cachedBorderRadiusTokensByCollection.clear();
            yield Promise.all([
                getSpacingVariables(true),
                getBorderRadiusVariables(true),
                getAvailableCollections(true)
            ]);
            figma.notify("Variables cache refreshed");
            figma.ui.postMessage({
                type: 'variables-refreshed'
            });
        }
    }
    catch (error) {
        let message = 'Unknown error';
        if (error instanceof Error) {
            message = error.message;
        }
        else if (typeof error === 'string') {
            message = error;
        }
        console.error("Error handling UI message:", message, error);
        figma.notify(`Plugin error: ${message}. Check console.`, { error: true });
        figma.ui.postMessage({ type: 'error', message: message });
    }
});
function clearMarkers() {
    try {
        const markers = figma.currentPage.children.filter(node => (node.type === "ELLIPSE" || node.type === "RECTANGLE") &&
            (node.name === "⚠️ No Token Match" ||
                node.name === "✅ Can Fix Spacing" ||
                node.name === "⚠️ No Radius Token" ||
                node.name === "✅ Can Fix Border Radius" ||
                node.name === "⚠️ Spacing Issue" ||
                node.name === "🎨 Color Issue") &&
            node.getPluginData("markerFor") !== "");
        let clearedCount = 0;
        markers.forEach(markerNode => {
            if (markerNode.type === "ELLIPSE" || markerNode.type === "RECTANGLE") {
                markerNode.remove();
                clearedCount++;
            }
        });
        console.log(`Cleared ${clearedCount} markers.`);
        return clearedCount;
    }
    catch (error) {
        let message = 'Unknown error';
        if (error instanceof Error)
            message = error.message;
        else if (typeof error === 'string')
            message = error;
        console.error(`Error clearing markers: ${message}`);
        return 0;
    }
}
function findBorderRadiusIssues(filterByCollectionId) {
    return __awaiter(this, void 0, void 0, function* () {
        const borderRadiusTokens = yield getBorderRadiusVariables(false, filterByCollectionId);
        const issues = [];
        // Pre-create a Map for faster token lookup by value
        const tokensByValue = new Map();
        borderRadiusTokens.forEach(token => {
            tokensByValue.set(token.value, token);
        });
        function isIndividualRadiusBound(node, propertyName) {
            var _a;
            try {
                return ((_a = node.boundVariables) === null || _a === void 0 ? void 0 : _a[propertyName]) !== undefined;
            }
            catch (e) {
                console.warn(`Could not check boundVariables for ${node.name}.${propertyName}:`, e);
                return false;
            }
        }
        function areAllRadiiSameAndPositive(node) {
            if (!hasRadiusProperties(node))
                return false;
            const { topLeftRadius, topRightRadius, bottomLeftRadius, bottomRightRadius } = node;
            return topLeftRadius > 0 &&
                topLeftRadius === topRightRadius &&
                topLeftRadius === bottomLeftRadius &&
                topLeftRadius === bottomRightRadius;
        }
        function areAllRadiiBound(node) {
            return isIndividualRadiusBound(node, 'topLeftRadius') &&
                isIndividualRadiusBound(node, 'topRightRadius') &&
                isIndividualRadiusBound(node, 'bottomLeftRadius') &&
                isIndividualRadiusBound(node, 'bottomRightRadius');
        }
        // Optimized token lookup using Map
        function findMatchingTokenByValue(value) {
            return tokensByValue.get(value) || null;
        }
        function checkNode(node) {
            if (isBorderRadiusNode(node) && hasRadiusProperties(node)) {
                const { topLeftRadius, topRightRadius, bottomLeftRadius, bottomRightRadius } = node;
                const allRadiiSameAndPositive = areAllRadiiSameAndPositive(node);
                // Check if all radii are the same and can be unified
                if (allRadiiSameAndPositive && !areAllRadiiBound(node)) {
                    const token = findMatchingTokenByValue(topLeftRadius);
                    issues.push({
                        node,
                        property: "borderRadiusAll",
                        currentValue: topLeftRadius,
                        matchingToken: token,
                        message: token ? `Map all corners to ${token.name}` : `No token for ${topLeftRadius}px uniform radius.`
                    });
                    addMarkerToNode(node, token ? "✅ Can Fix Border Radius" : "⚠️ No Radius Token", token !== null, 'borderRadius');
                }
                else {
                    // Check individual corner radii
                    const radiiToCheck = [
                        { value: topLeftRadius, property: 'topLeftRadius', displayName: 'top-left' },
                        { value: topRightRadius, property: 'topRightRadius', displayName: 'top-right' },
                        { value: bottomLeftRadius, property: 'bottomLeftRadius', displayName: 'bottom-left' },
                        { value: bottomRightRadius, property: 'bottomRightRadius', displayName: 'bottom-right' }
                    ];
                    for (const radius of radiiToCheck) {
                        if (radius.value > 0 && !isIndividualRadiusBound(node, radius.property) && !allRadiiSameAndPositive) {
                            const token = findMatchingTokenByValue(radius.value);
                            issues.push({
                                node,
                                property: radius.property,
                                currentValue: radius.value,
                                matchingToken: token,
                                message: token ? `Map ${radius.displayName} radius to ${token.name}` : `No token for ${radius.value}px ${radius.displayName} radius.`
                            });
                            addMarkerToNode(node, token ? "✅ Can Fix Border Radius" : "⚠️ No Radius Token", token !== null, 'borderRadius');
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
        // Smart scoping: prioritize selection, but don't process entire page unnecessarily
        const selection = figma.currentPage.selection;
        const nodesToCheck = selection.length > 0 ? selection : figma.currentPage.children;
        const collectionText = filterByCollectionId ? ` using collection filter` : '';
        console.log(`Analyzing ${nodesToCheck.length} ${selection.length > 0 ? 'selected' : 'top-level'} nodes for border radius issues${collectionText}...`);
        for (const node of nodesToCheck) {
            checkNode(node);
        }
        console.log(`Found ${issues.length} potential border radius issues.`);
        return issues;
    });
}
function findAllIssues(spacingCollectionId, borderRadiusCollectionId) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("Finding all tokenization issues with collection filters...");
        // Run both detection functions with their respective collection filters
        const [spacingIssues, borderRadiusIssues] = yield Promise.all([
            findSpacingIssues(spacingCollectionId),
            findBorderRadiusIssues(borderRadiusCollectionId)
        ]);
        const totalIssues = spacingIssues.length + borderRadiusIssues.length;
        const fixableIssues = spacingIssues.filter(issue => issue.matchingToken !== null).length +
            borderRadiusIssues.filter(issue => issue.matchingToken !== null).length;
        const unfixableIssues = totalIssues - fixableIssues;
        return {
            spacingIssues,
            borderRadiusIssues,
            totalIssues,
            fixableIssues,
            unfixableIssues
        };
    });
}
// Border radius binding function
function trySetBoundVariableRadius(node, propertyName, token) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            console.log(`Binding ${node.name}.${propertyName} to variable: ${token.name} (ID: ${token.id})`);
            node.setBoundVariable(propertyName, token.variableObject);
            // Verify using node.boundVariables and the token's ID
            const boundVariableAlias = (_a = node.boundVariables) === null || _a === void 0 ? void 0 : _a[propertyName];
            if (boundVariableAlias && boundVariableAlias.id === token.id) {
                console.log(`Successfully bound ${propertyName} for ${node.name} to ${token.name}`);
                return true;
            }
            else {
                console.warn(`Verification failed for ${node.name}.${propertyName}. Bound alias:`, boundVariableAlias, `Expected ID: ${token.id}`);
                return false;
            }
        }
        catch (e) {
            let message = 'Unknown error during binding';
            if (e instanceof Error)
                message = e.message;
            else if (typeof e === 'string')
                message = e;
            console.error(`Error binding ${propertyName} for node ${node.name} to variable ${token.name} (ID: ${token.id}): ${message}`);
            if (!token.variableObject || typeof token.variableObject.key !== 'string') {
                console.error("The provided token.variableObject seems invalid:", token.variableObject);
            }
            return false;
        }
    });
}
// Fix border radius issues
function fixBorderRadiusIssues(filterByCollectionId) {
    return __awaiter(this, void 0, void 0, function* () {
        const issues = yield findBorderRadiusIssues(filterByCollectionId);
        let fixedCount = 0;
        let unfixableCount = 0;
        const collectionText = filterByCollectionId ? ` using collection filter` : '';
        console.log(`Attempting to fix ${issues.length} border radius issues${collectionText}.`);
        // Count issues that don't have matching tokens
        issues.forEach(issue => {
            if (!issue.matchingToken) {
                unfixableCount++;
            }
        });
        for (const issue of issues) {
            if (issue.matchingToken && issue.matchingToken.variableObject) {
                const { node, property, matchingToken } = issue;
                let success = false;
                if (property === "borderRadiusAll") {
                    const propsToBind = ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius'];
                    let allSuccess = true;
                    for (const p of propsToBind) {
                        if (!(yield trySetBoundVariableRadius(node, p, matchingToken)))
                            allSuccess = false;
                    }
                    success = allSuccess;
                }
                else if (property === "topLeftRadius" || property === "topRightRadius" || property === "bottomLeftRadius" || property === "bottomRightRadius") {
                    success = yield trySetBoundVariableRadius(node, property, matchingToken);
                }
                if (success) {
                    fixedCount++;
                }
            }
        }
        console.log(`Successfully applied ${fixedCount} border radius variable bindings.`);
        console.log(`Unable to fix ${unfixableCount} issues due to missing matching tokens.`);
        return { fixed: fixedCount, unfixable: unfixableCount };
    });
}
// Updated revert function to handle both spacing and border radius
function revertAllBindingsToStatic() {
    return __awaiter(this, void 0, void 0, function* () {
        let spacingRevertedCount = 0;
        let borderRadiusRevertedCount = 0;
        // Helper function to remove binding and set static value for spacing
        function removeSpacingBindingAndSetStatic(node, property) {
            try {
                if (!node.boundVariables || !node.boundVariables[property]) {
                    return false;
                }
                const currentValue = node[property];
                node.setBoundVariable(property, null);
                node[property] = currentValue;
                return true;
            }
            catch (e) {
                console.error(`Error removing spacing binding for ${property} on node "${node.name}":`, e);
                return false;
            }
        }
        // Helper function to remove binding and set static value for border radius
        function removeBorderRadiusBindingAndSetStatic(node, property) {
            try {
                if (!node.boundVariables || !node.boundVariables[property]) {
                    return false;
                }
                const currentValue = node[property];
                node.setBoundVariable(property, null);
                node[property] = currentValue;
                return true;
            }
            catch (e) {
                console.error(`Error removing border radius binding for ${property} on node "${node.name}":`, e);
                return false;
            }
        }
        // Function to process a node and revert its bindings
        function processNode(node) {
            let nodeSpacingRevertCount = 0;
            let nodeBorderRadiusRevertCount = 0;
            // Handle spacing properties
            if (isAutoLayoutNode(node)) {
                const spacingProperties = [
                    'itemSpacing',
                    'paddingTop',
                    'paddingBottom',
                    'paddingLeft',
                    'paddingRight'
                ];
                for (const property of spacingProperties) {
                    if (removeSpacingBindingAndSetStatic(node, property)) {
                        nodeSpacingRevertCount++;
                        console.log(`Reverted ${property} on node "${node.name}" to static value ${node[property]}px`);
                    }
                }
            }
            // Handle border radius properties
            if (isBorderRadiusNode(node)) {
                const borderRadiusProperties = [
                    'topLeftRadius',
                    'topRightRadius',
                    'bottomLeftRadius',
                    'bottomRightRadius'
                ];
                for (const property of borderRadiusProperties) {
                    if (removeBorderRadiusBindingAndSetStatic(node, property)) {
                        nodeBorderRadiusRevertCount++;
                        console.log(`Reverted ${property} on node "${node.name}" to static value ${node[property]}px`);
                    }
                }
            }
            // Process children recursively
            if ("children" in node) {
                for (const child of node.children) {
                    const childResults = processNode(child);
                    nodeSpacingRevertCount += childResults.spacing;
                    nodeBorderRadiusRevertCount += childResults.borderRadius;
                }
            }
            return { spacing: nodeSpacingRevertCount, borderRadius: nodeBorderRadiusRevertCount };
        }
        // Get nodes to process (selection or all page nodes)
        const nodesToProcess = figma.currentPage.selection.length > 0
            ? figma.currentPage.selection
            : figma.currentPage.children;
        // Process all nodes
        for (const node of nodesToProcess) {
            const results = processNode(node);
            spacingRevertedCount += results.spacing;
            borderRadiusRevertedCount += results.borderRadius;
        }
        const totalCount = spacingRevertedCount + borderRadiusRevertedCount;
        console.log(`Reverted ${spacingRevertedCount} spacing token bindings and ${borderRadiusRevertedCount} border radius token bindings to static values.`);
        return {
            spacingCount: spacingRevertedCount,
            borderRadiusCount: borderRadiusRevertedCount,
            totalCount
        };
    });
}
// Get all available variable collections
function getAvailableCollections() {
    return __awaiter(this, arguments, void 0, function* (forceRefresh = false) {
        const now = Date.now();
        if (!forceRefresh && cachedCollections && (now - collectionsTimestamp) < CACHE_DURATION) {
            console.log(`Using cached collections (${cachedCollections.length} collections)`);
            return cachedCollections;
        }
        const collections = [];
        try {
            // Get local collections
            if (hasGetLocalVariableCollections) {
                const localCollections = yield figma.variables.getLocalVariableCollectionsAsync();
                localCollections.forEach(collection => {
                    collections.push({
                        id: collection.id,
                        name: collection.name,
                        isLocal: true
                    });
                });
                console.log(`Found ${localCollections.length} local collections`);
            }
            // Get library collections
            if (hasTeamLibraryAPI) {
                const libraryCollections = yield figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
                libraryCollections.forEach(collection => {
                    collections.push({
                        id: collection.key, // Note: library collections use 'key' not 'id'
                        name: collection.name,
                        isLocal: false
                    });
                });
                console.log(`Found ${libraryCollections.length} library collections`);
            }
            cachedCollections = collections;
            collectionsTimestamp = now;
            console.log(`Total collections cached: ${collections.length}`);
            return collections;
        }
        catch (error) {
            console.error("Error fetching collections:", error);
            return [];
        }
    });
}
