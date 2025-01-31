'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { invoke } from "@tauri-apps/api/tauri";
import { PPLAContentType, PPLARequest } from "@/types";

interface Product {
    id: number;
    name: string;
    code: string;
    price: number;
}

interface Template {
    id: number;
    width: number;
    height: number;
    density: number;
    fields: string;
}

interface LabelPreviewProps {
    product: Product;
    template?: Template; // Tornando template opcional com ?
}

export function LabelPreview({ product, template }: LabelPreviewProps) {
    const [isPrinting, setIsPrinting] = useState(false);

    const handlePrint = async () => {
        try {
            setIsPrinting(true);

            // Configuração padrão se não houver template
            const defaultConfig = {
                width: 400,
                height: 300,
                density: 8,
                gap: 24
            };

            // Campos padrão se não houver template
            const defaultFields = [
                {
                    x: 50,
                    y: 50,
                    content: product.name,
                    field_type: PPLAContentType.Text,
                    font_size: 2
                },
                {
                    x: 50,
                    y: 100,
                    content: `R$ ${product.price.toFixed(2)}`,
                    field_type: PPLAContentType.Text,
                    font_size: 2
                },
                {
                    x: 50,
                    y: 150,
                    content: product.code,
                    field_type: PPLAContentType.Barcode
                }
            ];

            // Se houver template, usa as configurações dele
            const config = template ? {
                width: template.width,
                height: template.height,
                density: template.density,
                gap: 24
            } : defaultConfig;

            // Se houver template, usa os campos dele
            const fields = template ? 
                JSON.parse(template.fields).map((field: any) => ({
                    ...field,
                    content: field.field === 'product_name' ? product.name :
                            field.field === 'product_code' ? product.code :
                            field.field === 'price' ? `R$ ${product.price.toFixed(2)}` :
                            field.content
                })) : defaultFields;

            const ppla_request: PPLARequest = {
                config,
                fields,
                copies: 1
            };

            const printerConfig = {
                port: "COM1", // Você pode tornar isso configurável
                baud_rate: 9600,
                darkness: 8,
                width: config.width,
                height: config.height
            };

            await invoke('print_label', {
                config: printerConfig,
                ppla_request,
                template_id: template?.id,
                product_id: product.id
            });

            console.log('Etiqueta impressa com sucesso!');
        } catch (error) {
            console.error('Erro ao imprimir etiqueta:', error);
        } finally {
            setIsPrinting(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="border rounded-lg p-4 space-y-2">
                <h3 className="font-medium">Prévia da Etiqueta</h3>
                <div className="space-y-1 text-sm">
                    <p><strong>Produto:</strong> {product.name}</p>
                    <p><strong>Código:</strong> {product.code}</p>
                    <p><strong>Preço:</strong> R$ {product.price.toFixed(2)}</p>
                </div>
                {template && (
                    <div className="text-sm text-muted-foreground">
                        <p>Usando template: {template.width}x{template.height}mm</p>
                    </div>
                )}
            </div>
            <Button 
                onClick={handlePrint} 
                disabled={isPrinting}
                className="w-full"
            >
                {isPrinting ? 'Imprimindo...' : 'Imprimir Etiqueta'}
            </Button>
        </div>
    );
}