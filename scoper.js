var vscode = require( 'vscode' );
const util = require( "./scoperUtil" );

function setRangeStyle()
{
    return vscode.window.createTextEditorDecorationType( {
        overviewRulerColor: vscode.workspace.getConfiguration( 'scoper' ).overviewColor,
        overviewRulerLane: vscode.OverviewRulerLane.Right,
        light: {
            backgroundColor: vscode.workspace.getConfiguration( 'scoper' ).highlightColor
        },
        dark: {
            backgroundColor: vscode.workspace.getConfiguration( 'scoper' ).highlightColor
        }
    } );
}

function setEndStyle()
{
    return vscode.window.createTextEditorDecorationType( {
        light: {
            backgroundColor: vscode.workspace.getConfiguration( 'scoper' ).endColor
        },
        dark: {
            backgroundColor: vscode.workspace.getConfiguration( 'scoper' ).endColor
        }
    } );
}

var scoperRangeDecorationType = setRangeStyle();
var scoperEndDecorationType = setEndStyle();

var Scoper = ( function()
{
    function Scoper()
    {
    }

    Scoper.prototype.updateConfig = function()
    {
        if( vscode.window.activeTextEditor )
        {
            vscode.window.activeTextEditor.setDecorations( scoperRangeDecorationType, [] );
            vscode.window.activeTextEditor.setDecorations( scoperEndDecorationType, [] );
        }
        scoperRangeDecorationType.dispose();

        scoperRangeDecorationType = setRangeStyle();
        scoperEndDecorationType = setEndStyle();

        util.scoperUtil.updateConfig();
    };

    class SearchResult
    {
        constructor( bracket, offset, delimiters )
        {
            this.bracket = bracket;
            this.offset = offset;
            this.delimiters = delimiters;
        }
    }

    function findBackward( text, index )
    {
        const bracketStack = [];
        let offset = 0;
        let bracket = '';
        let delimiters = [];

        for( let i = index; i >= 0; i-- )
        {
            let char = text.charAt( i );
            if( util.scoperUtil.isOpenBracket( char ) )
            {
                if( bracketStack.length === 0 )
                {
                    bracket = char;
                    offset = i;
                    break;
                }
                else
                {
                    let top = bracketStack.pop();
                    if( !util.scoperUtil.isMatch( char, top ) )
                    {
                        throw 'Unmatched bracket pair';
                    }
                }
            }
            else if( char === ',' )
            {
                if( bracketStack.length === 0 )
                {
                    delimiters.push(i)
                }
            }
            else if( util.scoperUtil.isCloseBracket( char ) )
            {
                bracketStack.push( char );
            }
        }

        return new SearchResult( bracket, offset, delimiters );
    }

    function findForward( text, index )
    {
        const bracketStack = [];
        let offset = text.length;
        let bracket = '';
        let delimiters = [];
        for( let i = index; i < text.length; i++ )
        {
            let char = text.charAt( i );
            if( util.scoperUtil.isCloseBracket( char ) )
            {
                if( bracketStack.length === 0 )
                {
                    offset = i;
                    bracket = char;
                    break;
                }
                else
                {
                    let top = bracketStack.pop();
                    if( !util.scoperUtil.isMatch( top, char ) )
                    {
                        throw 'Unmatched bracket pair';
                    }
                }
            }
            else if( char === ',' )
            {
                if( bracketStack.length === 0 )
                {
                    delimiters.push(i)
                }
            }
            else if( util.scoperUtil.isOpenBracket( char ) )
            {
                bracketStack.push( char );
            }
        }

        delimiters.push(offset)

        return new SearchResult( bracket, offset, delimiters );
    }

    function trimStartPos(text, start, end) {
        let pos = start;
        for (let index = start; index < end; index++) {
            const element = text.charAt(index);
            if (!/\s/.test(element)) {
                pos = index;
                break;
            }
        }
        return pos;
    }

    function trimEndPos(text, start, end) {
        let pos = end;
        for (let index = end; index > start; index--) {
            const element = text.charAt(index);
            if (!/\s/.test(element)) {
                pos = index + 1;
                break;
            }
        }
        return pos;
    }

    Scoper.prototype.update = function()
    {
        const editor = vscode.window.activeTextEditor;

        if( !editor )
        {
            return;
        }
        else if( !editor.selection.isEmpty )
        {
            editor.setDecorations( scoperRangeDecorationType, [] );
            return;
        }

        const offset = editor.document.offsetAt( editor.selection.active );
        const text = editor.document.getText();

        try
        {
            const backwardResult = findBackward( text, offset - 1 );
            const forwardResult = findForward( text, offset );
            let endDecorations = [];
            let rangeDecorations = [];

            if( !util.scoperUtil.isMatch( backwardResult.bracket, forwardResult.bracket ) )
            {
                editor.setDecorations( scoperRangeDecorationType, [] );
                return;
            }

            let start = backwardResult.offset < text.length ? backwardResult.offset + 1 : backwardResult.offset;
            let end = forwardResult.offset;
            let delimiters = backwardResult.delimiters.concat(forwardResult.delimiters);

            if (delimiters.length != 0) {
                let last_start = start;
                delimiters.sort(function(a, b) {
                    return a - b;
                }).forEach(element => {
                    let chunk_start = trimStartPos(text,last_start,element-1);
                    let chunk_end = trimEndPos(text,last_start,element-1);
                    let range_decoration = new vscode.Range(
                        editor.document.positionAt(chunk_start),
                        editor.document.positionAt(chunk_end)
                    );
                    rangeDecorations.push( range_decoration );
                    last_start = element + 1;

                    let delimiter_range = new vscode.Range( editor.document.positionAt( element ), editor.document.positionAt( element + 1 ) );
                    endDecorations.push( delimiter_range );
                });
            }else{
                const range_decoration = new vscode.Range( editor.document.positionAt( start ), editor.document.positionAt( end ) );
                rangeDecorations.push( range_decoration );
            }
            const end_decoration = new vscode.Range( editor.document.positionAt( end ), editor.document.positionAt( end + 1 ) );
            const start_decoration = new vscode.Range( editor.document.positionAt( start - 1 ), editor.document.positionAt( start ) );

            endDecorations.push( start_decoration );
            endDecorations.push( end_decoration );
            editor.setDecorations( scoperRangeDecorationType, rangeDecorations );
            editor.setDecorations( scoperEndDecorationType, endDecorations );
        }
        catch( error )
        {
            editor.setDecorations( scoperRangeDecorationType, [] );
            editor.setDecorations( scoperEndDecorationType, [] );
        }
    };

    Scoper.prototype.dispose = function()
    {
        this.decorator.dispose();
    };


    return Scoper;
}() );

exports.Scoper = Scoper;
