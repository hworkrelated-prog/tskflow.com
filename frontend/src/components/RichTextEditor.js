import React, { useMemo } from 'react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

const RichTextEditor = ({ value, onChange, placeholder = "Enter description...", className = "" }) => {
    const modules = useMemo(() => ({
        toolbar: [
            ['bold', 'italic', 'underline'],
            [{ 'list': 'ordered' }, { 'list': 'bullet' }],
            ['link'],
            ['clean']
        ]
    }), []);

    const formats = [
        'bold', 'italic', 'underline',
        'list', 'bullet',
        'link'
    ];

    return (
        <div className={`rich-text-editor ${className}`}>
            <ReactQuill
                theme="snow"
                value={value || ''}
                onChange={onChange}
                modules={modules}
                formats={formats}
                placeholder={placeholder}
                className="bg-white rounded-md"
            />
            <style jsx global>{`
                .rich-text-editor .ql-toolbar {
                    background: #f9fafb;
                    border: 1px solid #e5e7eb;
                    border-top-left-radius: 0.375rem;
                    border-top-right-radius: 0.375rem;
                    padding: 8px;
                }
                .rich-text-editor .ql-container {
                    border: 1px solid #e5e7eb;
                    border-bottom-left-radius: 0.375rem;
                    border-bottom-right-radius: 0.375rem;
                    font-size: 14px;
                    min-height: 150px;
                }
                .rich-text-editor .ql-editor {
                    min-height: 150px;
                    max-height: 400px;
                    overflow-y: auto;
                }
                .rich-text-editor .ql-editor.ql-blank::before {
                    color: #9ca3af;
                    font-style: normal;
                }
                .rich-text-editor .ql-toolbar.ql-snow {
                    border-bottom: 1px solid #e5e7eb;
                }
                .rich-text-editor .ql-snow .ql-stroke {
                    stroke: #4b5563;
                }
                .rich-text-editor .ql-snow .ql-fill {
                    fill: #4b5563;
                }
                .rich-text-editor .ql-snow .ql-picker-label {
                    color: #4b5563;
                }
                .rich-text-editor .ql-toolbar button:hover,
                .rich-text-editor .ql-toolbar button:focus {
                    color: #4f46e5;
                }
                .rich-text-editor .ql-toolbar button:hover .ql-stroke,
                .rich-text-editor .ql-toolbar button:focus .ql-stroke {
                    stroke: #4f46e5;
                }
                .rich-text-editor .ql-toolbar button:hover .ql-fill,
                .rich-text-editor .ql-toolbar button:focus .ql-fill {
                    fill: #4f46e5;
                }
                .rich-text-editor .ql-snow.ql-toolbar button.ql-active,
                .rich-text-editor .ql-snow.ql-toolbar .ql-picker-label.ql-active {
                    color: #4f46e5;
                }
                .rich-text-editor .ql-snow.ql-toolbar button.ql-active .ql-stroke,
                .rich-text-editor .ql-snow.ql-toolbar .ql-picker-label.ql-active .ql-stroke {
                    stroke: #4f46e5;
                }
                .rich-text-editor .ql-snow.ql-toolbar button.ql-active .ql-fill,
                .rich-text-editor .ql-snow.ql-toolbar .ql-picker-label.ql-active .ql-fill {
                    fill: #4f46e5;
                }
            `}</style>
        </div>
    );
};

export default RichTextEditor;
